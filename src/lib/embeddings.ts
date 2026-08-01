import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Cheap, cost-optimized embedding generation for the Semantic Search
// Copilot (Phase 2, Task 3). Uses Gemini's text-embedding-004 (768 dims,
// free-tier eligible, same GEMINI_API_KEY already used for AI summaries /
// JD generation / candidate matching -- no new credential needed) rather
// than a paid embeddings API.

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMS = 768;

export { EMBEDDING_DIMS };

/**
 * Generates a single embedding vector for a chunk of text. Returns null
 * (rather than throwing) if GEMINI_API_KEY isn't configured or the API
 * call fails -- callers should treat that as "skip for now, try again on
 * the next sweep" rather than a hard error.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text.trim()) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
    const result = await model.embedContent(text.slice(0, 8000)); // keep well under token limits, cheap
    const values = result?.embedding?.values;
    if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) return null;
    return values;
  } catch {
    return null;
  }
}

type CandidateForEmbedding = {
  id: string;
  full_name: string | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  current_job_title: string | null;
  current_employer: string | null;
  current_industry: string | null;
  industries: string[] | null;
  total_experience_years: number | null;
  current_location: string | null;
  skills: string | null;
  segment_data: Record<string, unknown> | null;
  ai_summary: string | null;
  resume_text: string | null;
};

/**
 * Builds a single natural-language blob summarizing a candidate's profile
 * for embedding. Pulls from the same fields the AI passport/match ranking
 * already reads (category, sub-domain, segment_data, resume_text,
 * ai_summary) so the semantic search "understands" a candidate the same
 * way the rest of the system already does -- no separate taxonomy.
 */
export function buildCandidateEmbeddingText(c: CandidateForEmbedding): string {
  const parts: string[] = [];
  if (c.full_name) parts.push(c.full_name);
  if (c.current_job_title || c.current_employer) {
    parts.push(`Currently ${c.current_job_title ?? "working"} at ${c.current_employer ?? "an employer"}.`);
  }
  if (c.category || c.sub_domain) {
    parts.push(`Function/Domain: ${[c.category, c.sub_domain].filter(Boolean).join(" - ")}.`);
  }
  if (c.secondary_sub_domains?.length) {
    parts.push(`Also experienced in: ${c.secondary_sub_domains.join(", ")}.`);
  }
  if (typeof c.total_experience_years === "number") {
    parts.push(`${c.total_experience_years} years total experience.`);
  }
  if (c.current_location) parts.push(`Based in ${c.current_location}.`);
  if (c.current_industry || c.industries?.length) {
    parts.push(`Industry background: ${[c.current_industry, ...(c.industries ?? [])].filter(Boolean).join(", ")}.`);
  }
  if (c.skills) parts.push(`Skills: ${c.skills}.`);
  if (c.segment_data && Object.keys(c.segment_data).length) {
    const seg = Object.entries(c.segment_data)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`)
      .join("; ");
    if (seg) parts.push(`Profile details: ${seg}.`);
  }
  if (c.ai_summary) parts.push(c.ai_summary);
  if (c.resume_text) parts.push(c.resume_text.slice(0, 3000));
  return parts.join(" ");
}

/**
 * Generates and persists an embedding for one candidate. Shared by the
 * cron backfill sweep and any future on-demand regeneration trigger.
 */
export async function embedCandidate(
  candidate: CandidateForEmbedding,
  supabase: SupabaseClient
): Promise<boolean> {
  const text = buildCandidateEmbeddingText(candidate);
  const embedding = await generateEmbedding(text);
  if (!embedding) return false;

  const { error } = await supabase
    .from("candidates")
    .update({
      profile_embedding: embedding,
      profile_embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", candidate.id);

  return !error;
}

type MandateForEmbedding = {
  id: string;
  role_title: string | null;
  category: string | null;
  sub_domain: string | null;
  sub_domains: string[] | null;
  job_description: string | null;
  jd_overview: string | null;
  jd_responsibilities: string | null;
  jd_candidate_profile: string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  embedding_source_hash: string | null;
};

function buildMandateEmbeddingText(m: MandateForEmbedding): string {
  const parts: string[] = [];
  if (m.role_title) parts.push(m.role_title);
  if (m.category || m.sub_domain) {
    parts.push(`Function/Domain: ${[m.category, m.sub_domain].filter(Boolean).join(" - ")}.`);
  }
  if (m.sub_domains?.length) parts.push(`Also relevant sub-domains: ${m.sub_domains.join(", ")}.`);
  if (m.jd_overview) parts.push(m.jd_overview);
  if (m.jd_responsibilities) parts.push(m.jd_responsibilities);
  if (m.jd_candidate_profile) parts.push(m.jd_candidate_profile);
  if (m.job_description) parts.push(m.job_description);
  if (m.must_haves?.length) parts.push(`Must haves: ${m.must_haves.join(", ")}.`);
  if (m.good_to_haves?.length) parts.push(`Good to haves: ${m.good_to_haves.join(", ")}.`);
  return parts.join(" ");
}

/**
 * Ensures a mandate has an up-to-date embedding, computing/persisting one
 * only if missing or if the JD-relevant fields have changed since the last
 * computation (mandates has no generic updated_at column to compare
 * against, so this hashes the same text that gets embedded -- same
 * staleness pattern as candidates.career_timeline_resume_source_hash).
 * Called lazily from mandate-auto-rematch rather than on a dedicated cron,
 * since mandates change far less often than candidates are created.
 * Returns the embedding (existing or freshly computed), or null if it
 * can't be produced (no GEMINI_API_KEY, empty JD text, API failure).
 */
export async function ensureMandateEmbedding(
  mandate: MandateForEmbedding,
  supabase: SupabaseClient
): Promise<number[] | null> {
  const text = buildMandateEmbeddingText(mandate);
  if (!text.trim()) return null;
  const hash = crypto.createHash("md5").update(text).digest("hex");

  if (mandate.embedding_source_hash === hash) {
    const { data } = await supabase.from("mandates").select("embedding").eq("id", mandate.id).single();
    const existing = data?.embedding as unknown;
    if (Array.isArray(existing) && existing.length === EMBEDDING_DIMS) return existing as number[];
    // Hash matches but embedding is missing/malformed -- fall through and recompute.
  }

  const embedding = await generateEmbedding(text);
  if (!embedding) return null;

  await supabase
    .from("mandates")
    .update({
      embedding,
      embedding_updated_at: new Date().toISOString(),
      embedding_source_hash: hash,
    })
    .eq("id", mandate.id);

  return embedding;
}
