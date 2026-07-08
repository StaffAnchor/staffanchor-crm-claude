import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type CandidateMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  must_haves_met: string[];
  must_haves_missing: string[];
  good_to_haves_met: string[];
};

export type MatchMandateResult =
  | { ok: true; matches: CandidateMatch[]; scanned: number }
  | { ok: false; status: number; error: string };

type CandidateRow = {
  id: string;
  full_name: string;
  current_job_title: string | null;
  current_employer: string | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  total_experience_years: number | null;
  current_location: string | null;
  open_to_relocation: string | null;
  notice_period: string | null;
  expected_fixed_ctc: number | null;
  skills: string | null;
  current_industry: string | null;
  industries: string[] | null;
  segment_data: Record<string, unknown> | null;
  self_assessment: Record<string, unknown> | null;
  recruiter_assessment: Record<string, unknown> | null;
  resume_text: string | null;
  ai_summary: string | null;
};

function parseJsonArray(raw: string): CandidateMatch[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed as CandidateMatch[];
    if (parsed && Array.isArray((parsed as { matches?: unknown }).matches)) {
      return (parsed as { matches: CandidateMatch[] }).matches;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Finds and AI-ranks candidates from the existing pool against a mandate's
 * JD + must-haves/good-to-haves. Two stage pipeline to keep this bounded and
 * cheap as the candidate pool grows:
 *   1. Cheap SQL pre-filter on category/sub-domain/experience/CTC/location
 *      overlap -- narrows thousands of candidates down to a shortlist.
 *   2. That shortlist's profiles (+ cached resume text) are sent to Gemini
 *      in one call to score, rank, and explain fit against the JD and
 *      must-have/good-to-have checklist.
 */
export async function matchCandidatesForMandate(
  mandateId: string,
  supabase: SupabaseClient
): Promise<MatchMandateResult> {
  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select(
      "id, role_title, client_name, category, sub_domain, city, budget_min, budget_max, experience_min, experience_max, job_description, must_haves, good_to_haves"
    )
    .eq("id", mandateId)
    .single();

  if (mandateError || !mandate) {
    return { ok: false, status: 404, error: "Mandate not found" };
  }
  const m = mandate;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "AI matching is not configured yet (missing GEMINI_API_KEY on the server).",
    };
  }

  // Already-linked candidates don't need to be suggested again.
  const { data: existingLinks } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id")
    .eq("mandate_id", mandateId);
  const linkedIds = new Set((existingLinks ?? []).map((l) => l.candidate_id as string));

  // Stage 1: cheap SQL pre-filter. Same category is required (a B2C hunter
  // profile isn't useful for a B2B enterprise mandate); sub-domain, location,
  // and experience/CTC are soft signals folded into scoring below rather than
  // hard filters, since a strong adjacent-domain candidate is still worth
  // surfacing to the recruiter with a lower score.
  let query = supabase
    .from("candidates")
    .select(
      "id, full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, open_to_relocation, notice_period, expected_fixed_ctc, skills, current_industry, industries, segment_data, self_assessment, recruiter_assessment, resume_text, ai_summary"
    )
    .neq("status", "awaiting_input")
    .limit(400);

  if (mandate.category) query = query.eq("category", mandate.category);

  const { data: pool, error: poolError } = await query;
  if (poolError) {
    return { ok: false, status: 500, error: poolError.message };
  }

  const candidates = ((pool ?? []) as CandidateRow[]).filter((c) => !linkedIds.has(c.id));

  if (candidates.length === 0) {
    return { ok: true, matches: [], scanned: 0 };
  }

  // Score a cheap heuristic to rank/trim the pool before spending AI tokens
  // on it -- keeps the Gemini call bounded to a sane shortlist size.
  function heuristicScore(c: CandidateRow): number {
    let s = 0;
    if (m.sub_domain && c.sub_domain === m.sub_domain) s += 3;
    if (m.sub_domain && c.secondary_sub_domains?.includes(m.sub_domain)) s += 1.5;
    if (m.city && c.current_location?.toLowerCase().includes(String(m.city).toLowerCase())) s += 1.5;
    if (m.city && c.open_to_relocation && /yes|open/i.test(c.open_to_relocation)) s += 0.5;
    if (
      m.experience_min != null &&
      m.experience_max != null &&
      c.total_experience_years != null &&
      c.total_experience_years >= m.experience_min &&
      c.total_experience_years <= m.experience_max
    ) {
      s += 2;
    }
    if (
      m.budget_max != null &&
      c.expected_fixed_ctc != null &&
      c.expected_fixed_ctc <= Number(m.budget_max) * 1.15
    ) {
      s += 1;
    }
    return s;
  }

  const shortlist = candidates
    .map((c) => ({ c, s: heuristicScore(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 40)
    .map(({ c }) => c);

  const factSheets = shortlist.map((c) => ({
    candidate_id: c.id,
    name: c.full_name,
    current_role: c.current_job_title,
    current_employer: c.current_employer,
    category: c.category,
    primary_sub_domain: c.sub_domain,
    secondary_sub_domains: c.secondary_sub_domains,
    total_experience_years: c.total_experience_years,
    location: c.current_location,
    open_to_relocation: c.open_to_relocation,
    notice_period: c.notice_period,
    expected_fixed_ctc_lakhs: c.expected_fixed_ctc,
    skills: c.skills,
    current_industry: c.current_industry,
    other_industries_worked_in: (c.industries as string[] | null)?.filter((i) => i !== c.current_industry),
    self_reported_segment_data: c.segment_data,
    self_assessment_writeups: c.self_assessment,
    recruiter_scorecard: c.recruiter_assessment,
    resume_excerpt: c.resume_text ? c.resume_text.slice(0, 3000) : null,
    existing_ai_summary: c.ai_summary,
  }));

  const prompt = `You are a sharp sales recruiter matching candidates from an existing candidate pool against one open mandate (job requisition). Score and rank ONLY the candidates given below -- never invent a candidate, employer, skill, or fact not present in their data.

Mandate:
- Role: ${m.role_title} at ${m.client_name}
- Category / sub-domain: ${m.category} / ${m.sub_domain}
- Location: ${m.city ?? "not specified"}
- Experience range: ${m.experience_min ?? "?"}-${m.experience_max ?? "?"} years
- Budget (fixed CTC, lakhs): up to ${m.budget_max ?? "not specified"}
- Job description: ${m.job_description ?? "(none provided)"}
- Must haves (hard requirements): ${JSON.stringify(m.must_haves ?? [])}
- Good to haves (nice-to-haves): ${JSON.stringify(m.good_to_haves ?? [])}

Candidates to evaluate (JSON array):
${JSON.stringify(factSheets, null, 2)}

For EACH candidate, decide if they are worth surfacing to the recruiter at all. Only include candidates with a genuine, defensible case for fit -- omit weak/irrelevant candidates entirely rather than padding the list.

Return ONLY a JSON array (no markdown fence, no commentary), one object per included candidate, each with exactly these keys:
- "candidate_id": copy exactly from the input.
- "score": integer 0-100, overall fit against the mandate (weigh must-haves heavily -- missing a must-have should cap the score well below 70).
- "reason": one tight sentence a recruiter would say explaining why this candidate is worth considering (or notable caveat), grounded in specific facts, not generic praise.
- "must_haves_met": array of strings from the mandate's must-haves list that this candidate appears to satisfy, based on their data/resume.
- "must_haves_missing": array of strings from the mandate's must-haves list that this candidate does NOT appear to satisfy or that can't be confirmed from available data.
- "good_to_haves_met": array of strings from the mandate's good-to-haves list this candidate satisfies.

Sort the array by score descending. Include at most 15 candidates.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const parsed = parseJsonArray(raw);
      if (!parsed) {
        lastError = new Error("Could not parse AI response as JSON");
        continue;
      }

      const nameById = new Map(shortlist.map((c) => [c.id, c.full_name]));
      const matches: CandidateMatch[] = parsed
        .filter((m) => nameById.has(m.candidate_id))
        .map((m) => ({
          candidate_id: m.candidate_id,
          full_name: nameById.get(m.candidate_id) ?? "Unknown",
          score: typeof m.score === "number" ? m.score : 0,
          reason: m.reason ?? "",
          must_haves_met: Array.isArray(m.must_haves_met) ? m.must_haves_met : [],
          must_haves_missing: Array.isArray(m.must_haves_missing) ? m.must_haves_missing : [],
          good_to_haves_met: Array.isArray(m.good_to_haves_met) ? m.good_to_haves_met : [],
        }))
        .sort((a, b) => b.score - a.score);

      return { ok: true, matches, scanned: candidates.length };
    } catch (err) {
      lastError = err;
      console.error(`Gemini candidate matching failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has hit its free-tier quota. Try again later or use a paid-tier key."
      : "AI candidate matching failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
