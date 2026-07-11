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
