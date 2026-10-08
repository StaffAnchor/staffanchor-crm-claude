import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { missingKeyDetails } from "@/lib/key-details";
import { emptySpec, evaluateConstraints, sanitizeSpec, type Check, type SearchSpec } from "@/lib/search-spec";

// Prompt search, version 2. The steps, in order:
//  1. Understand the ask: split it into hard constraints (city, experience, CTC, notice) and
//     qualitative asks ("hunter, not farmer", "B2B SaaS").
//  2. Recall candidates by meaning (embeddings), plus those not embedded yet.
//  3. Apply the hard constraints with plain code. A clear miss is hidden (and counted so the
//     recruiter can see why); missing data is shown as "unknown", never guessed.
//  4. Have the AI read the best few dozen, with their CV facts, in small batches, and judge each
//     qualitative ask with the evidence.
//  5. Rank. Candidates whose constraints are all confirmed outrank those with gaps.

export type SearchMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  category: string | null;
  sub_domain: string | null;
  practices: { name: string; seniority_band: string }[];
  resume_file_url: string | null;
  checks: Check[];
  missing: string[];
};

export type SearchResult =
  | { ok: true; matches: SearchMatch[]; scanned: number; spec: SearchSpec; understood: boolean; hidden: Record<string, number>; inPipelineSkipped: number; partial: boolean }
  | { ok: false; status: number; error: string };

type Row = {
  id: string;
  full_name: string;
  status: string;
  current_job_title: string | null;
  current_employer: string | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  total_experience_years: number | null;
  current_location: string | null;
  open_to_relocation: string | null;
  notice_period: string | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  skills: string | null;
  current_industry: string | null;
  industries: string[] | null;
  ai_summary: string | null;
  resume_file_url: string | null;
};

const COLUMNS =
  "id, full_name, status, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, open_to_relocation, notice_period, current_fixed_ctc, expected_fixed_ctc, skills, current_industry, industries, ai_summary, resume_file_url";

const AI_POOL = 80;
const BATCH = 20;
const MAX_RESULTS = 25;

function parseJson(raw: string): unknown {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const a = cleaned.search(/[[{]/);
    const b = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (a === -1 || b <= a) return null;
    try {
      return JSON.parse(cleaned.slice(a, b + 1));
    } catch {
      return null;
    }
  }
}

/** Step 1: what is the recruiter asking for? Falls back to "no constraints" if the AI can't be reached. */
export async function understandPrompt(prompt: string): Promise<{ spec: SearchSpec; understood: boolean }> {
  const ask = `A recruiter typed this search for candidates in an Indian sales-hiring database:\n"""${prompt.slice(0, 1200)}"""\n\nReturn ONLY a JSON object with exactly these keys:\n{"cities": string[], "min_exp": number|null, "max_exp": number|null, "max_expected_ctc": number|null, "max_current_ctc": number|null, "max_notice_days": number|null, "must": string[], "nice": string[]}\n\nRules:\n- Fill a constraint ONLY if the recruiter clearly stated it. Otherwise null or [].\n- cities: city names exactly as typed (a region like "NCR" stays "NCR").\n- min_exp / max_exp: years. "4-7 years" is 4 and 7; "8+ years" is min 8, max null; "under 5 years" is max 5.\n- CTC figures are lakhs per year (LPA). "expected CTC under 30 LPA" is max_expected_ctc 30.\n- max_notice_days: "immediate" is 0, "under 30 days" is 30, "2 months" is 60.\n- must: the qualitative things a CV must show (for example "hunter, not farmer", "B2B SaaS", "has managed a team"). Short phrases, at most 6. Do NOT repeat the constraints above here.\n- nice: preferences that are not mandatory, at most 6.`;
  try {
    const { text } = await generateTextWithFallback(ask, { json: true, thinkingBudget: 256 });
    return { spec: sanitizeSpec(parseJson(text)), understood: true };
  } catch {
    return { spec: emptySpec(), understood: false };
  }
}

/** A search seeded from a mandate: its place, experience, budget and must-haves become the constraints. */
export function seedFromMandate(m: {
  role_title: string;
  sub_domain: string | null;
  city: string | null;
  cities: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  budget_max: number | string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  selling_style: string | null;
  jd_overview: string | null;
}): { prompt: string; spec: SearchSpec; embeddingText: string } {
  const cities = (m.cities?.length ? m.cities : m.city ? [m.city] : []).filter((c) => c && !/^(remote|anywhere|pan india|any)$/i.test(c.trim()));
  const budget = m.budget_max !== null && m.budget_max !== undefined && Number.isFinite(Number(m.budget_max)) ? Number(m.budget_max) : null;
  const must = [...(m.must_haves ?? [])];
  if (m.selling_style) must.push(`${m.selling_style} selling style`);
  const spec = sanitizeSpec({
    cities,
    min_exp: m.experience_min,
    max_exp: m.experience_max,
    max_expected_ctc: budget,
    must: must.slice(0, 6),
    nice: (m.good_to_haves ?? []).slice(0, 6),
  });
  const parts = [m.role_title + (m.sub_domain ? ` (${m.sub_domain})` : "")];
  if (cities.length) parts.push(`in ${cities.join(" / ")}`);
  if (m.experience_min !== null || m.experience_max !== null) parts.push(`${m.experience_min ?? 0}-${m.experience_max ?? "+"} years`);
  if (budget !== null) parts.push(`budget up to ${budget} LPA`);
  const prompt = parts.join(", ");
  return { prompt, spec, embeddingText: `${prompt}. ${(m.jd_overview ?? "").slice(0, 500)}` };
}

type CvFactsRow = { candidate_id: string; facts: Record<string, unknown> | null };

/** A short, factual digest of what a candidate's CV says, for the AI to judge against. */
function cvDigest(f: Record<string, unknown> | null): unknown {
  if (!f) return null;
  const roles = (Array.isArray(f.roles) ? (f.roles as Record<string, unknown>[]) : []).slice(0, 3).map((r) => ({
    company: r.company,
    title: r.title,
    current: r.is_current,
    sells: r.sells,
    customer_type: r.customer_type,
    motion: r.motion,
    deal_size: r.deal_size,
    quota: r.quota_or_target,
    achievement: r.achievement,
    team_size: r.team_size,
  }));
  return { roles, sales: f.sales, industries: f.industries, tools: f.tools };
}

export async function searchCandidates(
  prompt: string,
  supabase: SupabaseClient,
  options: { practiceId?: string; mandateId?: string; spec?: SearchSpec; embeddingText?: string }
): Promise<SearchResult> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Prompt is required" };
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return { ok: false, status: 503, error: "AI search is not configured yet (set GEMINI_API_KEY, GROQ_API_KEY, or MISTRAL_API_KEY on the server)." };
  }

  // 1. Understand (unless the recruiter has already edited the chips).
  const understoodNow = options.spec ? { spec: sanitizeSpec(options.spec), understood: true } : await understandPrompt(trimmed);
  const spec = understoodNow.spec;

  // 2. Recall.
  const pool = new Map<string, Row>();
  const similarity = new Map<string, number>();
  if (options.practiceId) {
    const { data: links } = await supabase.from("candidate_practices").select("candidate_id").eq("practice_id", options.practiceId);
    const ids = Array.from(new Set((links ?? []).map((l) => l.candidate_id as string)));
    if (ids.length === 0) return { ok: true, matches: [], scanned: 0, spec, understood: understoodNow.understood, hidden: {}, inPipelineSkipped: 0, partial: false };
    const { data: rows, error } = await supabase.from("candidates").select(COLUMNS).in("id", ids).neq("status", "awaiting_input");
    if (error) return { ok: false, status: 500, error: error.message };
    for (const r of (rows ?? []) as Row[]) pool.set(r.id, r);
  } else {
    try {
      const { generateEmbedding } = await import("@/lib/embeddings");
      const emb = await generateEmbedding(options.embeddingText ?? trimmed);
      if (emb) {
        const { data: sem } = await supabase.rpc("match_candidates", { query_embedding: emb, match_count: 1000 });
        const ids = ((sem ?? []) as { id: string; similarity: number }[]).filter((m) => m.id).map((m) => {
          similarity.set(m.id, m.similarity);
          return m.id;
        });
        // Fetch in slices: a long id list does not fit in one request URL.
        for (let i = 0; i < ids.length; i += 200) {
          const { data: rows } = await supabase.from("candidates").select(COLUMNS).in("id", ids.slice(i, i + 200)).neq("status", "awaiting_input");
          for (const r of (rows ?? []) as Row[]) pool.set(r.id, r);
        }
      }
    } catch (err) {
      console.error("Semantic recall failed for prompt search", err);
    }
    // Candidates with no embedding yet, so a search can still reach them.
    const { data: unembedded, error } = await supabase.from("candidates").select(COLUMNS).neq("status", "awaiting_input").is("profile_embedding", null).order("updated_at", { ascending: false }).limit(500);
    if (error) return { ok: false, status: 500, error: error.message };
    for (const r of (unembedded ?? []) as Row[]) if (!pool.has(r.id)) pool.set(r.id, r);
  }

  // A mandate search skips people already in that mandate's pipeline.
  let inPipelineSkipped = 0;
  if (options.mandateId) {
    const { data: linked } = await supabase.from("candidate_mandate_links").select("candidate_id").eq("mandate_id", options.mandateId);
    for (const l of linked ?? []) if (pool.delete(l.candidate_id as string)) inPipelineSkipped++;
  }
  const scanned = pool.size;

  // 3. Hard constraints, by code.
  const hidden: Record<string, number> = {};
  const structured = new Map<string, Check[]>();
  const passing: Row[] = [];
  for (const r of pool.values()) {
    const checks = evaluateConstraints(r, spec);
    const failed = checks.find((c) => c.status === "not_met");
    if (failed) {
      hidden[failed.key] = (hidden[failed.key] ?? 0) + 1;
      continue;
    }
    structured.set(r.id, checks);
    passing.push(r);
  }
  if (passing.length === 0) return { ok: true, matches: [], scanned, spec, understood: understoodNow.understood, hidden, inPipelineSkipped, partial: false };

  // Best first: by meaning, then most recently updated for those without an embedding.
  const shortlist = passing.sort((a, b) => (similarity.get(b.id) ?? -1) - (similarity.get(a.id) ?? -1)).slice(0, AI_POOL);
  const ids = shortlist.map((c) => c.id);

  const [{ data: practiceRows }, { data: factRows }] = await Promise.all([
    supabase.from("candidate_practices").select("candidate_id, seniority_band, practices(name)").in("candidate_id", ids),
    supabase.from("candidate_cv_facts").select("candidate_id, facts").in("candidate_id", ids),
  ]);
  const practices = new Map<string, { name: string; seniority_band: string }[]>();
  for (const row of practiceRows ?? []) {
    const name = (row.practices as unknown as { name: string } | null)?.name;
    if (!name) continue;
    practices.set(row.candidate_id as string, [...(practices.get(row.candidate_id as string) ?? []), { name, seniority_band: row.seniority_band as string }]);
  }
  const facts = new Map<string, Record<string, unknown> | null>((factRows as CvFactsRow[] | null)?.map((f) => [f.candidate_id, f.facts]) ?? []);

  // 4. The AI reads them in small batches, in parallel.
  const qualitative = [...spec.must.map((r) => ({ requirement: r, required: true })), ...spec.nice.map((r) => ({ requirement: r, required: false }))];
  const sheet = (c: Row) => ({
    candidate_id: c.id,
    name: c.full_name,
    current_role: c.current_job_title,
    current_employer: c.current_employer,
    category: c.category,
    sub_domain: c.sub_domain,
    secondary_sub_domains: c.secondary_sub_domains,
    practices: practices.get(c.id) ?? [],
    experience_years: c.total_experience_years,
    city: c.current_location,
    current_ctc_lakhs: c.current_fixed_ctc,
    expected_ctc_lakhs: c.expected_fixed_ctc,
    notice: c.notice_period,
    skills: c.skills,
    industry: c.current_industry,
    other_industries: c.industries,
    summary: c.ai_summary ? c.ai_summary.slice(0, 350) : null,
    cv_facts: cvDigest(facts.get(c.id) ?? null),
  });

  type AiRow = { candidate_id: string; score?: number; reason?: string; checks?: { requirement?: string; status?: string; evidence?: string }[] };
  const askBatch = async (batch: Row[]): Promise<AiRow[] | null> => {
    const p = `You are a sharp sales recruiter searching an existing candidate database. Judge ONLY the candidates given. Never invent facts. If the data is silent on something, say it is unclear; do not guess.

Recruiter's request (verbatim): ${JSON.stringify(trimmed)}

Qualitative requirements to judge for EACH candidate (JSON; "required": false means nice to have):
${JSON.stringify(qualitative)}

(City, experience, CTC and notice have already been checked in code. Do not re-judge them.)

Candidates (JSON array):
${JSON.stringify(batch.map(sheet))}

Return ONLY a JSON array with one object per candidate worth surfacing (leave out clearly irrelevant ones), keys exactly:
- "candidate_id": copied exactly.
- "score": integer 0-100 for how well they fit the request overall, from facts such as what they sell, to whom, deal size, team size, domain and seniority.
- "reason": ONE tight sentence a recruiter would say, grounded in specific facts, including any caveat.
- "checks": one object per qualitative requirement, in the same order: {"requirement": the requirement text, "status": "met" | "unclear" | "not_met", "evidence": the specific fact (or "not stated in the profile or CV")}.`;
    try {
      const { text } = await generateTextWithFallback(p);
      const parsed = parseJson(text);
      const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { matches?: unknown })?.matches) ? (parsed as { matches: unknown[] }).matches : null;
      return arr as AiRow[] | null;
    } catch (err) {
      console.error("Prompt search batch failed", err instanceof Error ? err.message : err);
      return null;
    }
  };
  const batches: Row[][] = [];
  for (let i = 0; i < shortlist.length; i += BATCH) batches.push(shortlist.slice(i, i + BATCH));
  const results = await Promise.all(batches.map(askBatch));
  const failed = results.filter((r) => r === null).length;
  if (failed === batches.length) return { ok: false, status: 500, error: "AI candidate search failed on every configured provider. Please try again." };

  // 5. Rank.
  const rowById = new Map(shortlist.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const matches: SearchMatch[] = [];
  for (const row of results.flat()) {
    if (!row || !rowById.has(row.candidate_id) || seen.has(row.candidate_id)) continue;
    seen.add(row.candidate_id);
    const c = rowById.get(row.candidate_id)!;
    const hard = structured.get(c.id) ?? [];
    const ai: Check[] = qualitative.map((q, i) => {
      const got = row.checks?.[i];
      const s = got?.status === "met" ? "met" : got?.status === "not_met" ? "not_met" : "unknown";
      return { key: `ai:${i}`, label: q.requirement + (q.required ? "" : " (nice to have)"), status: s, evidence: got?.evidence?.toString().slice(0, 200) || "not stated in the profile or CV" };
    });
    // Confirmed beats gaps: small deductions for near-misses and unknowns on the hard constraints.
    let score = typeof row.score === "number" ? Math.max(0, Math.min(100, Math.round(row.score))) : 0;
    for (const h of hard) score -= h.status === "near" ? 4 : h.status === "unknown" ? 2 : 0;
    for (const a of ai) if (a.status === "not_met" && qualitative[Number(a.key.slice(3))]?.required) score -= 12;
    matches.push({
      candidate_id: c.id,
      full_name: c.full_name,
      score: Math.max(0, score),
      reason: row.reason ?? "",
      current_job_title: c.current_job_title,
      current_employer: c.current_employer,
      current_location: c.current_location,
      total_experience_years: c.total_experience_years,
      current_fixed_ctc: c.current_fixed_ctc,
      expected_fixed_ctc: c.expected_fixed_ctc,
      notice_period: c.notice_period,
      category: c.category,
      sub_domain: c.sub_domain,
      practices: practices.get(c.id) ?? [],
      resume_file_url: c.resume_file_url,
      checks: [...hard, ...ai],
      missing: missingKeyDetails(c).map((m) => m.label),
    });
  }
  matches.sort((a, b) => b.score - a.score);
  return { ok: true, matches: matches.slice(0, MAX_RESULTS), scanned, spec, understood: understoodNow.understood, hidden, inPipelineSkipped, partial: failed > 0 };
}
