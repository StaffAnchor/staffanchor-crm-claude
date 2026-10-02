import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_QUALITY_MODELS, generateTextWithFallback } from "@/lib/ai-providers";
import { logAiUsage } from "@/lib/ai-usage";
import type { CvFacts } from "@/lib/cv-facts";

// AI matching from the whole candidate bank, in two stages so it stays fast
// and cheap as the bank grows:
//   1. A free, instant prefilter over everyone whose CV has been read:
//      semantic similarity, experience range, location, and how many of the
//      role's requirement words appear in their CV facts.
//   2. The AI checks only the best few against each requirement, and for
//      each one says Met (with the evidence), Missing (clearly contradicted)
//      or Doubt (not stated or unclear) with a question to ask. A doubt is
//      never treated as a no: it is something the recruiter confirms.
// Results are stored per role so nobody has to re-run them to look.

export type ReqStatus = "met" | "doubt" | "missing";
export type ReqCheck = { requirement: string; status: ReqStatus; evidence: string | null; question: string | null };
export type Fit = "strong" | "possible" | "weak";
export type ExperienceFit = "within" | "below" | "above" | "unknown";
export type LocationFit = "match" | "relocate" | "other" | "unknown";
export type MatchChecks = { must: ReqCheck[]; good: ReqCheck[]; experience: ExperienceFit; location: LocationFit };

export const EVALUATE_PER_RUN = 30;
const POOL_RECALL = 300;
const CONCURRENCY = 5;
const MATCH_THINKING_BUDGET = 1024;
// Candidates this many years under the minimum are not worth an AI check.
const EXPERIENCE_SLACK_BELOW = 1.5;

export type RoleForMatch = {
  id: string;
  role_title: string | null;
  status: string;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  cities: string[] | null;
  city: string | null;
  embedding: unknown;
};

export type CandidateProfile = {
  id: string;
  full_name: string | null;
  total_experience_years: number | null;
  current_location: string | null;
  open_to_relocation: string | null;
  notice_period: string | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  current_job_title: string | null;
  current_employer: string | null;
};

// CTC is stored in lakhs per annum, but some profiles hold rupees (for example
// 3500000). Treat zero or negative as missing and rupee-sized values as rupees.
export function normalizeCtc(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  const lakhs = n > 1000 ? n / 100000 : n;
  return Math.round(lakhs * 10) / 10;
}

export function cleanList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}

// Changes whenever the requirements do, so stored matches know they are stale.
export function specHashOf(r: Pick<RoleForMatch, "must_haves" | "good_to_haves" | "experience_min" | "experience_max" | "cities" | "city" | "role_title">): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        t: r.role_title ?? "",
        m: cleanList(r.must_haves),
        g: cleanList(r.good_to_haves),
        e: [r.experience_min, r.experience_max],
        c: [...cleanList(r.cities), r.city ?? ""].map((x) => x.toLowerCase()).sort(),
      })
    )
    .digest("hex")
    .slice(0, 24);
}

const STOP = new Set(["the", "and", "for", "with", "from", "that", "this", "have", "has", "had", "are", "was", "were", "will", "can", "per", "any", "all", "not", "but", "you", "your", "their", "them", "its", "into", "than", "then", "also", "such", "well", "good", "strong", "experience", "experienced", "minimum", "years", "year", "work", "working", "ability", "skills", "skill", "knowledge", "willingness", "willing", "required", "preferred", "must", "should"]);

export function tokenize(text: string): string[] {
  return Array.from(new Set((text.toLowerCase().match(/[a-z0-9+#]{3,}/g) ?? []).filter((t) => !STOP.has(t))));
}

export function factsText(f: CvFacts): string {
  const parts: string[] = [f.headline_claim ?? "", ...f.industries, ...f.tools, ...f.geographies, ...f.certifications, f.sales.primary_motion ?? "", f.sales.customer_type ?? "", ...f.sales.segments];
  for (const r of f.roles) {
    parts.push(r.title ?? "", r.company ?? "", r.industry ?? "", r.sells ?? "", r.motion ?? "", r.customer_type ?? "", ...r.segments, ...r.buyers, r.deal_size ?? "", r.quota_or_target ?? "", r.achievement ?? "");
  }
  return parts.join(" ").toLowerCase();
}

// 0..1: average share of each requirement's key words found in the CV facts.
export function keywordCoverage(requirements: string[], text: string): number {
  if (requirements.length === 0) return 0.5;
  const scores = requirements.map((req) => {
    const toks = tokenize(req);
    if (toks.length === 0) return 0.5;
    return toks.filter((t) => text.includes(t)).length / toks.length;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function experienceFit(years: number | null, min: number | null, max: number | null): ExperienceFit {
  if (years == null || (min == null && max == null)) return "unknown";
  if (min != null && years < min) return "below";
  if (max != null && years > max) return "above";
  return "within";
}

const yes = (v: string | null) => !!v && /^(yes|maybe|depends)/i.test(v.trim());
const no = (v: string | null) => !!v && /^no\b/i.test(v.trim());

// Cities that are one hiring region: someone in Delhi is a local candidate
// for a Noida or Gurgaon role.
const REGIONS: string[][] = [
  ["delhi", "new delhi", "noida", "greater noida", "gurgaon", "gurugram", "ghaziabad", "faridabad", "ncr"],
  ["mumbai", "navi mumbai", "thane", "mumbai suburban"],
  ["bangalore", "bengaluru"],
  ["hyderabad", "secunderabad"],
  ["pune", "pimpri", "chinchwad"],
  ["chennai"],
  ["kolkata", "calcutta"],
  ["ahmedabad", "gandhinagar"],
];

function regionsOf(text: string): Set<number> {
  const found = new Set<number>();
  REGIONS.forEach((aliases, i) => {
    if (aliases.some((a) => text.includes(a))) found.add(i);
  });
  return found;
}

export function locationFit(roleCities: string[], candidateLocation: string | null, relocation: string | null): LocationFit {
  const wanted = roleCities.map((c) => c.toLowerCase().trim()).filter((c) => c && c !== "remote");
  if (roleCities.some((c) => c.toLowerCase().trim() === "remote") && wanted.length === 0) return "match";
  if (wanted.length === 0) return "unknown";
  const loc = (candidateLocation ?? "").toLowerCase();
  if (!loc) return yes(relocation) ? "relocate" : "unknown";
  if (wanted.some((c) => loc.includes(c))) return "match";
  const candRegions = regionsOf(loc);
  if (wanted.some((c) => [...regionsOf(c)].some((r) => candRegions.has(r)))) return "match";
  return yes(relocation) ? "relocate" : "other";
}

export function deriveFit(must: ReqCheck[], location: LocationFit): Fit {
  const missing = must.filter((c) => c.status === "missing").length;
  const doubt = must.filter((c) => c.status === "doubt").length;
  let fit: Fit = missing >= 2 ? "weak" : missing === 1 || doubt >= 2 ? "possible" : "strong";
  if (fit === "strong" && location === "other") fit = "possible";
  return fit;
}

export function scoreFrom(must: ReqCheck[], good: ReqCheck[], exp: ExperienceFit, location: LocationFit): number {
  const share = (cs: ReqCheck[], doubtW: number, empty: number) =>
    cs.length === 0 ? empty : cs.reduce((s, c) => s + (c.status === "met" ? 1 : c.status === "doubt" ? doubtW : 0), 0) / cs.length;
  const expScore = exp === "within" ? 1 : exp === "above" ? 0.7 : exp === "below" ? 0.5 : 0.7;
  const locScore = location === "match" ? 1 : location === "relocate" ? 0.8 : location === "unknown" ? 0.8 : 0.4;
  return Math.round(100 * (0.6 * share(must, 0.5, 0.5) + 0.2 * share(good, 0.4, 0.5) + 0.1 * expScore + 0.1 * locScore));
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};

function normalizeChecks(raw: unknown, requirements: string[]): ReqCheck[] {
  const arr = Array.isArray(raw) ? raw : [];
  return requirements.map((requirement, i) => {
    const byIndex = arr[i] as Record<string, unknown> | undefined;
    const byText = arr.find((x) => typeof (x as Record<string, unknown>)?.requirement === "string" && String((x as Record<string, unknown>).requirement).toLowerCase().trim() === requirement.toLowerCase().trim()) as Record<string, unknown> | undefined;
    const o = byText ?? byIndex ?? {};
    const status: ReqStatus = o.status === "met" || o.status === "missing" || o.status === "doubt" ? (o.status as ReqStatus) : "doubt";
    return {
      requirement,
      status,
      evidence: str(o.evidence, 220),
      question: status === "met" ? null : str(o.question, 200) ?? (status === "doubt" ? "Confirm this on the call" : null),
    };
  });
}

export function parseEvidenceJson(text: string, must: string[], good: string[]): { must: ReqCheck[]; good: ReqCheck[]; summary: string | null } | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const p = JSON.parse(cleaned);
    if (!p || typeof p !== "object") return null;
    if (!Array.isArray(p.must_haves)) return null;
    return { must: normalizeChecks(p.must_haves, must), good: normalizeChecks(p.good_to_haves, good), summary: str(p.summary, 240) };
  } catch {
    return null;
  }
}

function compactFacts(f: CvFacts, p: CandidateProfile) {
  return {
    profile: {
      total_experience_years: p.total_experience_years,
      location: p.current_location,
      open_to_relocation: p.open_to_relocation,
      notice_period: p.notice_period,
      current_fixed_ctc_lakhs: p.current_fixed_ctc,
      expected_fixed_ctc_lakhs: p.expected_fixed_ctc,
    },
    headline_claim: f.headline_claim,
    years_from_dates: f.experience_years_from_dates,
    sales_profile: f.sales,
    roles: f.roles.map((r) => ({ company: r.company, title: r.title, from: r.start, to: r.is_current ? "present" : r.end, industry: r.industry, sells: r.sells, customer_type: r.customer_type, segments: r.segments, motion: r.motion, buyers: r.buyers, deal_size: r.deal_size, target: r.quota_or_target, result: r.achievement, team: r.team_size })),
    industries: f.industries,
    tools: f.tools,
    education: f.education,
    flags: f.flags,
  };
}

export function buildEvidencePrompt(role: RoleForMatch, must: string[], good: string[], f: CvFacts, p: CandidateProfile): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x, i) => `${i + 1}. ${x}`).join("\n") : "(none)");
  return `You are a recruiter at StaffAnchor checking ONE candidate against a client's requirements for the role "${role.role_title ?? "role"}". Use ONLY the structured facts below, which were read from the candidate's CV, plus the profile data in them.

Client's MUST HAVES:
${list(must)}

Client's GOOD TO HAVES:
${list(good)}
${role.experience_min != null || role.experience_max != null ? `\nExperience asked: ${role.experience_min ?? "?"} to ${role.experience_max ?? "?"} years.` : ""}

For every requirement, in the same order, give:
- "status": "met" if the facts clearly show it; "missing" only if the facts clearly show the opposite (for example only B2C selling when B2B is required, or no sales roles at all); "doubt" if the facts are silent, partial or ambiguous. Not stated is a "doubt", never "missing".
- "evidence": for met or missing, the specific fact in under 20 words, naming the company where possible. For a doubt, what the CV does say that is related, or null.
- "question": for a doubt or missing item, one short, specific question a recruiter can ask on a call to settle it. null if met.
Do not treat the headline claim as evidence unless the job history backs it up. Do not invent facts.
Also give "summary": one plain sentence a recruiter can read in three seconds, with the strongest reason to consider this person and the biggest doubt.

Candidate facts (JSON):
${JSON.stringify(compactFacts(f, p))}

Return ONLY JSON: {"must_haves":[{"requirement":"","status":"","evidence":"","question":""}],"good_to_haves":[{"requirement":"","status":"","evidence":"","question":""}],"summary":""}`;
}

export type AiMatchRunResult =
  | { ok: true; evaluated: number; strong: number; possible: number; weak: number; poolSize: number; withFacts: number; alreadyChecked: number; remaining: number; failed: number }
  | { ok: false; error: string };

type FactsRow = { candidate_id: string; facts: CvFacts; source_hash: string };

async function recallIds(admin: SupabaseClient, embedding: unknown): Promise<string[] | null> {
  if (!embedding) return null;
  const { data, error } = await admin.rpc("match_candidates", { query_embedding: embedding, match_count: POOL_RECALL });
  if (error || !data) return null;
  return (data as { id: string }[]).map((r) => r.id);
}

export async function runAiMatchForMandate(mandateId: string, admin: SupabaseClient, opts: { limit?: number } = {}): Promise<AiMatchRunResult> {
  const limit = opts.limit ?? EVALUATE_PER_RUN;
  const { data: role, error } = await admin
    .from("mandates")
    .select("id, role_title, status, must_haves, good_to_haves, experience_min, experience_max, cities, city, embedding")
    .eq("id", mandateId)
    .single();
  if (error || !role) return { ok: false, error: "Role not found" };
  const r = role as unknown as RoleForMatch;
  if (r.status !== "open") return { ok: false, error: "This role isn't open, so it isn't matched." };
  const must = cleanList(r.must_haves);
  const good = cleanList(r.good_to_haves);
  if (must.length === 0) return { ok: false, error: "Set the must-haves first. Matching checks candidates against them." };
  const spec = specHashOf(r);

  // Who to leave out: already in this role's pipeline, or already decided.
  const [{ data: linked }, { data: decided }, { data: prior }] = await Promise.all([
    admin.from("candidate_mandate_links").select("candidate_id").eq("mandate_id", mandateId),
    admin.from("mandate_ai_matches").select("candidate_id").eq("mandate_id", mandateId).in("status", ["added", "dismissed"]),
    admin.from("mandate_ai_matches").select("candidate_id, spec_hash, facts_hash").eq("mandate_id", mandateId).eq("status", "suggested"),
  ]);
  const skip = new Set<string>([...(linked ?? []).map((x) => x.candidate_id as string), ...(decided ?? []).map((x) => x.candidate_id as string)]);
  const priorByCandidate = new Map((prior ?? []).map((x) => [x.candidate_id as string, x as { spec_hash: string; facts_hash: string | null }]));

  // Pool: semantic recall when we have an embedding, else everyone with facts.
  const recalled = await recallIds(admin, r.embedding);
  let factsRows: FactsRow[] = [];
  if (recalled && recalled.length > 0) {
    const { data } = await admin.from("candidate_cv_facts").select("candidate_id, facts, source_hash").in("candidate_id", recalled);
    factsRows = (data ?? []) as FactsRow[];
  } else {
    const { data } = await admin.from("candidate_cv_facts").select("candidate_id, facts, source_hash").limit(3000);
    factsRows = (data ?? []) as FactsRow[];
  }
  const similarityRank = new Map((recalled ?? []).map((id, i) => [id, 1 - i / Math.max(1, (recalled ?? []).length)]));
  const pool = factsRows.filter((f) => !skip.has(f.candidate_id));
  if (pool.length === 0) return { ok: true, evaluated: 0, strong: 0, possible: 0, weak: 0, poolSize: 0, withFacts: factsRows.length, alreadyChecked: 0, remaining: 0, failed: 0 };

  const ids = pool.map((p) => p.candidate_id);
  const { data: profiles } = await admin
    .from("candidates")
    .select("id, full_name, total_experience_years, current_location, open_to_relocation, notice_period, current_fixed_ctc, expected_fixed_ctc, current_job_title, current_employer, is_demo")
    .in("id", ids);
  const profileById = new Map(((profiles ?? []) as (CandidateProfile & { is_demo?: boolean })[]).filter((p) => !p.is_demo).map((p) => [p.id, p]));

  const roleCities = [...cleanList(r.cities), ...(r.city ? [r.city] : [])];
  const reqs = [...must, ...good];

  // Stage 1: free prefilter and rank.
  type Scored = { row: FactsRow; profile: CandidateProfile; prelim: number; exp: ExperienceFit; loc: LocationFit };
  const scored: Scored[] = [];
  for (const row of pool) {
    const profile = profileById.get(row.candidate_id);
    if (!profile) continue;
    const years = profile.total_experience_years != null ? Number(profile.total_experience_years) : row.facts.experience_years_from_dates;
    const exp = experienceFit(years, r.experience_min, r.experience_max);
    if (exp === "below" && r.experience_min != null && years != null && years < r.experience_min - EXPERIENCE_SLACK_BELOW) continue;
    const loc = locationFit(roleCities, profile.current_location, profile.open_to_relocation);
    if (loc === "other" && no(profile.open_to_relocation)) continue;
    const coverage = keywordCoverage(reqs, factsText(row.facts));
    const sim = similarityRank.get(row.candidate_id) ?? 0.5;
    const expScore = exp === "within" ? 1 : exp === "above" ? 0.7 : exp === "below" ? 0.4 : 0.7;
    scored.push({ row, profile, prelim: 0.5 * coverage + 0.3 * sim + 0.2 * expScore, exp, loc });
  }
  scored.sort((a, b) => b.prelim - a.prelim);

  const needsCheck = scored.filter((s) => {
    const p = priorByCandidate.get(s.row.candidate_id);
    return !(p && p.spec_hash === spec && p.facts_hash === s.row.source_hash);
  });
  const alreadyChecked = scored.length - needsCheck.length;
  const batch = needsCheck.slice(0, limit);

  // Stage 2: the AI checks the best few against each requirement.
  const counts = { strong: 0, possible: 0, weak: 0, failed: 0 };
  async function evaluate(s: Scored): Promise<void> {
    const prompt = buildEvidencePrompt(r, must, good, s.row.facts, s.profile);
    let parsed: ReturnType<typeof parseEvidenceJson> = null;
    for (let attempt = 1; attempt <= 2 && !parsed; attempt++) {
      try {
        const res = await generateTextWithFallback(prompt, { geminiModels: GEMINI_QUALITY_MODELS, json: true, thinkingBudget: MATCH_THINKING_BUDGET });
        parsed = parseEvidenceJson(res.text, must, good);
        await logAiUsage({ purpose: "ai_match", refType: "mandate", refId: mandateId, result: res, error: parsed ? undefined : `unparseable response (attempt ${attempt})` });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await logAiUsage({ purpose: "ai_match", refType: "mandate", refId: mandateId, error: message });
        if (message.includes("429")) break;
      }
    }
    if (!parsed) {
      counts.failed++;
      return;
    }
    const fit = deriveFit(parsed.must, s.loc);
    const score = scoreFrom(parsed.must, parsed.good, s.exp, s.loc);
    counts[fit]++;
    await admin.from("mandate_ai_matches").upsert(
      {
        mandate_id: mandateId,
        candidate_id: s.row.candidate_id,
        fit,
        score,
        summary: parsed.summary,
        checks: { must: parsed.must, good: parsed.good, experience: s.exp, location: s.loc } satisfies MatchChecks,
        spec_hash: spec,
        facts_hash: s.row.source_hash,
        model: GEMINI_QUALITY_MODELS[0],
        status: "suggested",
        computed_at: new Date().toISOString(),
      },
      { onConflict: "mandate_id,candidate_id" }
    );
  }
  for (let i = 0; i < batch.length; i += CONCURRENCY) {
    await Promise.all(batch.slice(i, i + CONCURRENCY).map(evaluate));
  }

  await admin.from("mandates").update({ ai_match_last_run_at: new Date().toISOString(), ai_match_spec_hash: spec }).eq("id", mandateId);
  return {
    ok: true,
    evaluated: batch.length - counts.failed,
    strong: counts.strong,
    possible: counts.possible,
    weak: counts.weak,
    poolSize: scored.length,
    withFacts: factsRows.length,
    alreadyChecked,
    remaining: Math.max(0, needsCheck.length - batch.length),
    failed: counts.failed,
  };
}
