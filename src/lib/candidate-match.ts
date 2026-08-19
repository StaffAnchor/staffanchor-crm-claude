import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { ensureMandateEmbedding } from "@/lib/embeddings";
import { getLatestOutcomeWeights, outcomeAdjustedScore } from "@/lib/outcome-weights";

// Three-way per-requirement verdict -- this is the crux of the accuracy
// upgrade. "not_met" means the data actively contradicts/fails the
// requirement (e.g. stated experience is outside the mandated range, or a
// language list is given and the required language isn't in it) -- a real
// gap. "unclear" means the requirement is simply never addressed anywhere
// in the candidate's data (profile fields, self-assessment, resume text) --
// this is NOT the same as failing it, it just means nobody has asked yet,
// so the recruiter should confirm on a call rather than reject outright.
// Conflating these two (as the old must_haves_missing array did) is exactly
// the kind of false-negative that makes AI matching feel untrustworthy.
export type RequirementStatus = "met" | "not_met" | "unclear";

export type RequirementCheck = {
  requirement: string;
  status: RequirementStatus;
  // Short grounding note: the specific fact that justified the verdict, or
  // for "unclear", a plain confirmation this simply wasn't mentioned.
  evidence: string;
};

// Named, weighted components behind the overall score -- computed by the
// same Gemini call using an explicit formula (see prompt below), not a
// black box. Surfaced so a recruiter can click the score and see exactly
// why a candidate landed at, say, 62 instead of just trusting a number.
export type ScoreBreakdown = {
  must_haves_fit: number; // 0-100, weighted ~50% of score
  good_to_haves_fit: number; // 0-100, weighted ~10%
  experience_fit: number; // 0-100, weighted ~20%
  domain_relevance: number; // 0-100, weighted ~20%
  notes: string; // one or two sentences on what pulled the score up/down
};

export type CandidateMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  score_breakdown: ScoreBreakdown | null;
  // Score re-weighted using outcome-derived component weights instead of the
  // fixed 50/10/20/20 the prompt targets -- null until enough resolved
  // pipeline outcomes exist (see lib/outcome-weights.ts). Never shown as a
  // replacement for "score"; used only as a secondary sort signal so the
  // ranking itself gets sharper as real placement/rejection data accrues.
  outcome_adjusted_score: number | null;
  // 0-1 pgvector cosine similarity between this candidate and the mandate,
  // when this candidate came through the semantic recall path (null for
  // SQL-prefilter-only or override-path candidates). Snapshotted into
  // candidate_mandate_links.match_embedding_similarity on add-to-pipeline so
  // it becomes training signal for the outcome re-ranker.
  embedding_similarity: number | null;
  reason: string;
  must_haves: RequirementCheck[];
  good_to_haves: RequirementCheck[];
  // Attached directly from the candidate's own row data (never from the
  // LLM) so it's exact, not a paraphrase -- lets the match list itself flag
  // "no AI summary yet" and stability score without a second round trip to
  // the candidate's profile.
  stability_score: number | null;
  has_ai_summary: boolean;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
};

export type MatchMandateResult =
  | { ok: true; matches: CandidateMatch[]; scanned: number; calibration: { positive: number; negative: number }; requirementsChecked: string[] }
  | { ok: false; status: number; error: string };

// Stages that represent the recruiter having actively said "yes" to a
// candidate for this specific mandate -- used as positive calibration
// signal (below), not just "in the pipeline".
const POSITIVE_STAGES = new Set(["shortlisted", "submitted", "client_interview", "offer", "placed"]);

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
  skill_inventory: Record<string, unknown> | null;
  current_industry: string | null;
  industries: string[] | null;
  segment_data: Record<string, unknown> | null;
  self_assessment: Record<string, unknown> | null;
  recruiter_assessment: Record<string, unknown> | null;
  resume_text: string | null;
  ai_summary: string | null;
  stability_score: number | null;
  talent_micro_index: Record<string, unknown> | null;
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
  supabase: SupabaseClient,
  options?: {
    // Free-text, ad hoc extra requirements typed by a recruiter for one
    // specific search -- e.g. "Punjabi language is must, 5-9 years
    // experience mandatory, B2C Sales mandatory". These are treated as
    // ADDITIONAL hard must-haves layered on top of the mandate's own
    // must_haves for this run only; they are never written back to the
    // mandate record, so the standard cached match (and every other
    // recruiter's view of this mandate) is unaffected. Lets a recruiter
    // probe "what if I also required X" without editing the JD.
    extraCriteria?: string;
    // Gated proactive matcher (api/cron/proactive-match-sweep): when set,
    // skip the SQL pre-filter and embedding recall entirely and evaluate
    // ONLY these specific candidate ids against the mandate -- these are
    // candidates a cheap pgvector similarity check already flagged as
    // strong prospects for this mandate, so there's no need to re-derive
    // a pool; just run the same clause-level Gemini evaluation on them.
    candidateIdsOverride?: string[];
    // "Score pipeline" flow (mandate-candidates-view.tsx "Score pipeline"
    // button): scoring already-linked candidates is the whole point there,
    // so the normal "don't re-suggest candidates already on this mandate"
    // exclusion below must NOT apply when this is set. Only meaningful
    // together with candidateIdsOverride.
    includeAlreadyLinked?: boolean;
    // "Score pipeline" wants a score for as many of the (already bounded,
    // pre-qualified) linked candidates as reasonably possible, not just the
    // usual top-20-worth-surfacing-as-new-suggestions cap.
    maxResults?: number;
    // The default prompt tells the model to omit weak/irrelevant
    // candidates rather than pad the list -- exactly right when
    // suggesting NEW candidates from the wide pool, but wrong for "Score
    // pipeline": every candidate here is already on the mandate, so the
    // recruiter wants a score for literally all of them (including low
    // ones), not a filtered subset of "worth suggesting" ones.
    scoreAllProvided?: boolean;
  }
): Promise<MatchMandateResult> {
  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select(
      "id, role_title, client_name, category, sub_domain, sub_domains, city, budget_min, budget_max, experience_min, experience_max, job_description, jd_overview, jd_responsibilities, jd_candidate_profile, must_haves, good_to_haves, embedding, embedding_source_hash"
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

  // Already-linked candidates don't need to be suggested again. This same
  // query also doubles as the recruiter-feedback signal for this mandate --
  // stage tells us who they've actively said yes to (shortlisted onward)
  // vs explicitly rejected, which feeds the calibration block below.
  const { data: existingLinks } = await supabase
    .from("candidate_mandate_links")
    .select(
      "candidate_id, stage, rejection_reason, candidates(current_job_title, current_employer, category, sub_domain, total_experience_years, current_location, skills, current_industry)"
    )
    .eq("mandate_id", mandateId);
  const linkedIds = new Set((existingLinks ?? []).map((l) => l.candidate_id as string));

  type LinkedCandidateProfile = {
    current_job_title: string | null;
    current_employer: string | null;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_location: string | null;
    skills: string | null;
    current_industry: string | null;
  };

  const positiveExamples: (LinkedCandidateProfile & { stage: string })[] = [];
  const negativeExamples: (LinkedCandidateProfile & { rejection_reason: string | null })[] = [];
  for (const link of existingLinks ?? []) {
    const profile = link.candidates as unknown as LinkedCandidateProfile | null;
    if (!profile) continue;
    if (link.stage === "rejected") {
      negativeExamples.push({ ...profile, rejection_reason: (link.rejection_reason as string | null) ?? null });
    } else if (POSITIVE_STAGES.has(link.stage as string)) {
      positiveExamples.push({ ...profile, stage: link.stage as string });
    }
  }
  // Bounded so this stays a light calibration nudge, not a second full
  // dataset dump into the prompt -- most recent 12 of each is plenty of
  // signal for "what does a good/bad fit look like on this mandate".
  const calibrationPositive = positiveExamples.slice(-12);
  const calibrationNegative = negativeExamples.slice(-12);

  // Stage 1: cheap SQL pre-filter. Same category is required (a B2C hunter
  // profile isn't useful for a B2B enterprise mandate); sub-domain, location,
  // and experience/CTC are soft signals folded into scoring below rather than
  // hard filters, since a strong adjacent-domain candidate is still worth
  // surfacing to the recruiter with a lower score.
  const SELECT_COLUMNS =
    "id, full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, open_to_relocation, notice_period, expected_fixed_ctc, skills, skill_inventory, current_industry, industries, segment_data, self_assessment, recruiter_assessment, resume_text, ai_summary, stability_score, talent_micro_index";

  const override = options?.candidateIdsOverride;
  let candidates: CandidateRow[];
  const similarityById = new Map<string, number>();

  if (override && override.length > 0) {
    // Proactive-matcher path: the pool is already known (a pgvector
    // similarity check upstream already decided these are worth a real
    // look), so skip the SQL pre-filter and semantic recall entirely.
    const { data: overridePool, error: overrideError } = await supabase
      .from("candidates")
      .select(SELECT_COLUMNS)
      .in("id", override);
    if (overrideError) {
      return { ok: false, status: 500, error: overrideError.message };
    }
    candidates = options?.includeAlreadyLinked
      ? ((overridePool ?? []) as CandidateRow[])
      : ((overridePool ?? []) as CandidateRow[]).filter((c) => !linkedIds.has(c.id));
  } else {
    // Stage 1: cheap SQL pre-filter. Same category is required (a B2C hunter
    // profile isn't useful for a B2B enterprise mandate); sub-domain, location,
    // and experience/CTC are soft signals folded into scoring below rather than
    // hard filters, since a strong adjacent-domain candidate is still worth
    // surfacing to the recruiter with a lower score.
    let query = supabase.from("candidates").select(SELECT_COLUMNS).neq("status", "awaiting_input").limit(400);
    if (mandate.category) query = query.eq("category", mandate.category);

    const { data: pool, error: poolError } = await query;
    if (poolError) {
      return { ok: false, status: 500, error: poolError.message };
    }

    candidates = ((pool ?? []) as CandidateRow[]).filter((c) => !linkedIds.has(c.id));

    // Semantic recall: a fast, "does the system already remember someone
    // like this" pass over every candidate's stored embedding (computed by
    // the embed-candidates cron), independent of the SQL prefilter above.
    // Catches strong adjacent-domain or oddly-categorized candidates the
    // rigid category/sub_domain/experience/CTC filter would otherwise never
    // surface, without spending an extra Gemini call -- everything still
    // funnels into the single scoring call below. mandate.embedding is
    // computed lazily here (cheap -- one embedding call, not a full Gemini
    // generation) rather than via its own cron, since mandates change far
    // less often than candidates are created.
    try {
      const mandateEmbedding = await ensureMandateEmbedding(
        {
          id: mandate.id,
          role_title: mandate.role_title,
          category: mandate.category,
          sub_domain: mandate.sub_domain,
          sub_domains: (mandate as { sub_domains?: string[] | null }).sub_domains ?? null,
          job_description: mandate.job_description,
          jd_overview: (mandate as { jd_overview?: string | null }).jd_overview ?? null,
          jd_responsibilities: (mandate as { jd_responsibilities?: string | null }).jd_responsibilities ?? null,
          jd_candidate_profile: (mandate as { jd_candidate_profile?: string | null }).jd_candidate_profile ?? null,
          must_haves: mandate.must_haves as string[] | null,
          good_to_haves: mandate.good_to_haves as string[] | null,
          embedding_source_hash: (mandate as { embedding_source_hash?: string | null }).embedding_source_hash ?? null,
        },
        supabase
      );

      if (mandateEmbedding) {
        const { data: semanticMatches } = await supabase.rpc("match_candidates", {
          query_embedding: mandateEmbedding,
          match_count: 100,
        });
        const existingIds = new Set(candidates.map((c) => c.id));
        const newIds: string[] = [];
        for (const sm of (semanticMatches ?? []) as { id: string; status: string; similarity: number }[]) {
          if (linkedIds.has(sm.id) || sm.status === "awaiting_input") continue;
          similarityById.set(sm.id, sm.similarity);
          if (!existingIds.has(sm.id)) newIds.push(sm.id);
        }
        if (newIds.length > 0) {
          const { data: extra } = await supabase.from("candidates").select(SELECT_COLUMNS).in("id", newIds);
          for (const c of (extra ?? []) as CandidateRow[]) candidates.push(c);
        }
      }
    } catch (err) {
      // Best-effort recall path -- a failure here should never block matching,
      // just fall back to the SQL-prefilter-only pool.
      console.error("Embedding-based recall failed for mandate match", mandateId, err);
    }
  }

  const calibration = { positive: calibrationPositive.length, negative: calibrationNegative.length };

  if (candidates.length === 0) {
    return { ok: true, matches: [], scanned: 0, calibration, requirementsChecked: (m.must_haves as string[] | null) ?? [] };
  }

  // Score a cheap heuristic to rank/trim the pool before spending AI tokens
  // on it -- keeps the Gemini call bounded to a sane shortlist size. Blends
  // in the embedding similarity (0-1, scaled to 0-3) so a semantically
  // strong match that the rigid filters above would score zero on still
  // has a real shot at making the shortlist.
  function heuristicScore(c: CandidateRow): number {
    let s = (similarityById.get(c.id) ?? 0) * 3;
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

  // Expanded 60 -> 150: made affordable by sending the compact
  // talent_micro_index (~120 words) per candidate below instead of full
  // resume text/self-assessment/recruiter-scorecard blobs, so 150 fits in
  // roughly the token budget 60 used to need. Override path (proactive
  // matcher) already hands us a small, pre-qualified set, so the cap here
  // is a no-op for it.
  const shortlist = candidates
    .map((c) => ({ c, s: heuristicScore(c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 150)
    .map(({ c }) => c);

  // Durable, recruiter-confirmed facts (candidate_verified_facts) -- these
  // are candidate-intrinsic signals a recruiter has explicitly verified
  // (e.g. "resume claims don't hold up on a call", "job-hops without good
  // reason"), NOT raw rejection reasons from some other mandate. Fetched
  // for just this shortlist and folded into each factSheet below so the
  // scoring/reasoning can weigh them without ever silently penalizing a
  // candidate for something mandate-specific and irrelevant here.
  const verifiedFactsByCandidate = new Map<string, { fact_type: string; note: string | null }[]>();
  try {
    const { data: verifiedFacts } = await supabase
      .from("candidate_verified_facts")
      .select("candidate_id, fact_type, note")
      .in(
        "candidate_id",
        shortlist.map((c) => c.id)
      );
    for (const f of verifiedFacts ?? []) {
      const list = verifiedFactsByCandidate.get(f.candidate_id as string) ?? [];
      list.push({ fact_type: f.fact_type as string, note: f.note as string | null });
      verifiedFactsByCandidate.set(f.candidate_id as string, list);
    }
  } catch (err) {
    console.error("Fetching candidate_verified_facts failed for mandate match", mandateId, err);
  }

  // Lightweight fact sheet -- deliberately drops the heaviest fields (full
  // resume excerpt, self-assessment write-ups, recruiter scorecard, prior
  // AI summary) in favor of the compact talent_micro_index, so 150
  // candidates fit in roughly the token budget 60 used to need. skills/
  // skill_inventory are kept (already compact, and still cover
  // language/certification-type must-haves the micro-index doesn't) so
  // clause-level checking doesn't lose too much fidelity.
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
    skill_inventory: c.skill_inventory,
    current_industry: c.current_industry,
    other_industries_worked_in: (c.industries as string[] | null)?.filter((i) => i !== c.current_industry),
    talent_micro_index: c.talent_micro_index,
    recruiter_verified_facts: verifiedFactsByCandidate.get(c.id) ?? [],
  }));

const calibrationBlock =
    calibrationPositive.length + calibrationNegative.length === 0
      ? ""
      : `

Recruiter calibration for THIS mandate (learn from this, don't just re-derive fit from the JD alone):
- Candidates the recruiter has already accepted onto this mandate (shortlisted/submitted/interviewed/offered/placed) -- treat profiles resembling these as stronger signal than the raw must-haves suggest: ${JSON.stringify(calibrationPositive)}
- Candidates the recruiter has explicitly rejected for this mandate -- treat profiles resembling these as weaker signal, and factor in any stated rejection reason: ${JSON.stringify(calibrationNegative)}
Use these examples to calibrate what "good fit" actually means for this specific role and client, beyond what's written in the JD.`;

  // The recruiter's own must_haves (structured, one clause per array entry)
  // plus any one-off ad hoc criteria typed into the matching page's prompt
  // box for this run. Ad hoc text is free-form ("Punjabi language is must,
  // 5-9 years mandatory, B2C Sales mandatory") so Gemini is asked to split
  // it into the same atomic-clause shape as must_haves before evaluating --
  // every clause, from either source, gets the identical three-way
  // met/not_met/unclear treatment below.
  const extraCriteriaBlock = options?.extraCriteria?.trim()
    ? `\n- Additional ad hoc must-have requirements the recruiter typed in for THIS search only (split this into distinct atomic requirements yourself if it lists several things at once, then evaluate each exactly like a must-have below): ${JSON.stringify(options.extraCriteria.trim())}`
    : "";

  const prompt = `You are a sharp sales recruiter matching candidates from an existing candidate pool against one open mandate (job requisition). Score and rank ONLY the candidates given below -- never invent a candidate, employer, skill, or fact not present in their data.

Mandate:
- Role: ${m.role_title} at ${m.client_name}
- Category / sub-domain: ${m.category} / ${m.sub_domain}
- Location: ${m.city ?? "not specified"}
- Experience range: ${m.experience_min ?? "?"}-${m.experience_max ?? "?"} years
- Budget (fixed CTC, lakhs): up to ${m.budget_max ?? "not specified"}
- Job description: ${m.job_description ?? "(none provided)"}
- Must haves (hard requirements): ${JSON.stringify(m.must_haves ?? [])}
- Good to haves (nice-to-haves): ${JSON.stringify(m.good_to_haves ?? [])}${extraCriteriaBlock}
${calibrationBlock}

Candidates to evaluate (JSON array). Each candidate includes their core profile fields, skills/skill_inventory, a compact "talent_micro_index" (core sales motion, normalized deal-size band, buyer personas sold to, verified quota attainment, and known disqualifiers -- treat this as reliable, pre-extracted signal, not something to second-guess), and "recruiter_verified_facts" -- durable, recruiter-confirmed signals about the candidate as a person (e.g. fact_type "job_hopping_flag" or "resume_claims_unverified") that are NOT specific to this mandate. Weigh recruiter_verified_facts as a real signal: "resume_claims_unverified" should make you more conservative about trusting resume-derived "met" verdicts for that candidate; "job_hopping_flag" or "location_inflexibility" should factor into domain_relevance/experience_fit and the overall reason, not be ignored. Full resume text is NOT included here for most candidates (that's what talent_micro_index/skill_inventory are for) -- if a specific requirement genuinely can't be assessed from what's given, mark it "unclear" rather than guessing:
${JSON.stringify(factSheets, null, 2)}

CRITICAL -- how to evaluate each must-have / good-to-have / ad hoc requirement, one clause at a time. This is the single most important instruction: for EVERY requirement, decide one of exactly three verdicts, and do not conflate them:
- "met": the candidate's data (any of profile fields, self-assessment, recruiter scorecard, resume text) POSITIVELY confirms this requirement. Give the specific fact as evidence.
- "not_met": the candidate's data ACTIVELY CONTRADICTS or fails this requirement -- e.g. the mandate needs 5-9 years and this candidate has 2 or 14; the mandate needs a specific language and the candidate lists several languages spoken but not that one; the mandate needs B2C and the candidate's whole background is explicitly B2B with no B2C mentioned as a list item where it would have appeared. Give the specific contradicting fact as evidence.
- "unclear": the requirement is simply never addressed ANYWHERE in the candidate's data -- there is no language section at all, no explicit B2B/B2C label, etc. This is NOT the same as "not_met". Never guess or assume failure just because something wasn't mentioned -- mark it "unclear" and say so plainly in the evidence (e.g. "Not mentioned in profile or resume -- confirm on call"), so the recruiter knows to ask rather than being told the candidate lacks something that was simply never asked about.
Getting this three-way split right (met vs. not_met vs. unclear) matters more than the numeric score -- it's what lets a recruiter trust the tool enough to call a borderline candidate instead of skipping them.

${
  options?.scoreAllProvided
    ? `Every single candidate listed above is already on this mandate's pipeline -- the recruiter added them and wants to know how each one actually scores, not a filtered "worth suggesting" subset. Return one object for EVERY candidate_id given, with no exceptions, even a weak or clearly irrelevant fit: give it an honest low score and say why in "reason" rather than omitting it.`
    : `For EACH candidate, decide if they are worth surfacing to the recruiter at all. Only include candidates with a genuine, defensible case for fit -- omit weak/irrelevant candidates entirely rather than padding the list. A candidate with one or more "not_met" hard must-haves can still be included if otherwise strong, but their score must reflect the real gap.`
}

SCORE FORMULA -- the overall score must be explainable, not a vibe. Compute it from four named components, each 0-100, so a recruiter can see exactly why a candidate landed where they did:
- must_haves_fit (weight ~50%): 100 if every must-have is "met"; each "not_met" should drag this down hard (a single not_met should put this component below 40); each "unclear" should drag it down moderately (below 75), since it's a real unknown even if not a proven fail.
- good_to_haves_fit (weight ~10%): proportion of good-to-haves met.
- experience_fit (weight ~20%): how well total_experience_years sits inside the mandate's experience range (100 if comfortably inside; lower the further outside).
- domain_relevance (weight ~20%): how well category/sub-domain/industry/skill_inventory align with the mandate's category/sub-domain, independent of the must-have checklist.
Compute "score" as approximately the weighted sum of these four (round to nearest integer), then nudge it slightly using the recruiter calibration signal if provided above. Report the four components themselves so the math is auditable, not just the final number.

Return ONLY a JSON array (no markdown fence, no commentary), one object per included candidate, each with exactly these keys:
- "candidate_id": copy exactly from the input.
- "score": integer 0-100, per the SCORE FORMULA above.
- "score_breakdown": object {"must_haves_fit": <0-100>, "good_to_haves_fit": <0-100>, "experience_fit": <0-100>, "domain_relevance": <0-100>, "notes": "<one or two sentences on what specifically pulled the score up or down, referencing the actual gap -- e.g. 'Capped by one not_met must-have (language) and experience 1 year below range; strong domain match otherwise.'>"}.
- "reason": one tight sentence a recruiter would say explaining why this candidate is worth considering (or notable caveat), grounded in specific facts, not generic praise.
- "must_haves": array of objects, one per must-have clause (mandate's own must_haves, in order, followed by any ad hoc clauses you split out of the extra criteria text) -- each object is exactly {"requirement": "<the clause text>", "status": "met" | "not_met" | "unclear", "evidence": "<short grounding note, or 'Not mentioned in profile or resume -- confirm on call' for unclear>"}.
- "good_to_haves": array of objects in the same {"requirement", "status", "evidence"} shape, one per good-to-have clause.

Sort the array by score descending. ${
    options?.scoreAllProvided
      ? `Include every candidate given above -- do not cap or omit any.`
      : `Include at most ${options?.maxResults ?? 20} candidates.`
  }`;

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
      const rowById = new Map(shortlist.map((c) => [c.id, c]));
      const { weights: outcomeWeights } = await getLatestOutcomeWeights(supabase);

      function normalizeBreakdown(raw: unknown): ScoreBreakdown | null {
        if (!raw || typeof raw !== "object") return null;
        const b = raw as Record<string, unknown>;
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);
        return {
          must_haves_fit: num(b.must_haves_fit),
          good_to_haves_fit: num(b.good_to_haves_fit),
          experience_fit: num(b.experience_fit),
          domain_relevance: num(b.domain_relevance),
          notes: typeof b.notes === "string" ? b.notes : "",
        };
      }

      function normalizeChecks(raw: unknown): RequirementCheck[] {
        if (!Array.isArray(raw)) return [];
        return raw
          .filter((item): item is { requirement?: unknown; status?: unknown; evidence?: unknown } => !!item && typeof item === "object")
          .map((item) => {
            const status = item.status === "met" || item.status === "not_met" ? item.status : "unclear";
            return {
              requirement: typeof item.requirement === "string" ? item.requirement : "",
              status: status as RequirementStatus,
              evidence: typeof item.evidence === "string" ? item.evidence : "",
            };
          })
          .filter((c) => c.requirement.length > 0);
      }

      const matches: CandidateMatch[] = (
        parsed as unknown as {
          candidate_id: string;
          score?: number;
          score_breakdown?: unknown;
          reason?: string;
          must_haves?: unknown;
          good_to_haves?: unknown;
        }[]
      )
        .filter((row) => nameById.has(row.candidate_id))
        // The prompt's "include at most N" is an instruction, not an
        // enforced limit -- Gemini has been observed listing the same
        // candidate_id more than once. Dedupe here, at the source, so
        // every caller (Matching Workspace, Score pipeline, etc.) gets a
        // clean one-row-per-candidate result without each having to
        // defend against it separately.
        .filter((row, i, arr) => arr.findIndex((r) => r.candidate_id === row.candidate_id) === i)
        .map((row) => {
          const candidateRow = rowById.get(row.candidate_id);
          const breakdown = normalizeBreakdown(row.score_breakdown);
          return {
            candidate_id: row.candidate_id,
            full_name: nameById.get(row.candidate_id) ?? "Unknown",
            score: typeof row.score === "number" ? row.score : 0,
            score_breakdown: breakdown,
            outcome_adjusted_score: outcomeAdjustedScore(breakdown, outcomeWeights),
            embedding_similarity: similarityById.get(row.candidate_id) ?? null,
            reason: row.reason ?? "",
            must_haves: normalizeChecks(row.must_haves),
            good_to_haves: normalizeChecks(row.good_to_haves),
            // Sourced directly from the candidate's own row, never the LLM --
            // exact and lets the match card itself flag "no AI summary yet"
            // or show stability without a click into the profile.
            stability_score: candidateRow?.stability_score ?? null,
            has_ai_summary: !!candidateRow?.ai_summary,
            current_job_title: candidateRow?.current_job_title ?? null,
            current_employer: candidateRow?.current_employer ?? null,
            current_location: candidateRow?.current_location ?? null,
            total_experience_years: candidateRow?.total_experience_years ?? null,
            expected_fixed_ctc: candidateRow?.expected_fixed_ctc ?? null,
            notice_period: candidateRow?.notice_period ?? null,
          };
        })
        // Primary sort: how many hard must-haves are actually confirmed met
        // (this is what the recruiter asked for -- "3/3 matched" candidates
        // should surface above a higher-score candidate who's missing one),
        // then by outcome_adjusted_score as the tiebreaker within the same
        // match count -- identical to sorting by raw score until enough
        // resolved pipeline outcomes exist to move the weights away from the
        // fixed 50/10/20/20 default (see lib/outcome-weights.ts).
        .sort((a, b) => {
          const metA = a.must_haves.filter((c) => c.status === "met").length;
          const metB = b.must_haves.filter((c) => c.status === "met").length;
          if (metB !== metA) return metB - metA;
          return (b.outcome_adjusted_score ?? b.score) - (a.outcome_adjusted_score ?? a.score);
        });

      const requirementsChecked = [
        ...((m.must_haves as string[] | null) ?? []),
        ...(matches[0]?.must_haves.map((c) => c.requirement).filter((r) => !((m.must_haves as string[] | null) ?? []).includes(r)) ?? []),
      ];

      return { ok: true, matches, scanned: candidates.length, calibration, requirementsChecked };
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

// ---------------------------------------------------------------------
// Free-text global candidate search ("prompt window") -- distinct from
// matchCandidatesForMandate above: there's no mandate/JD to prefilter or
// score against, just a recruiter's own plain-English ask (e.g. "B2B SaaS
// AEs in Bangalore, 4-7 years, currently hunting not farming"). Kept as a
// separate, deliberately lighter function rather than bolting a "no
// mandate" branch onto matchCandidatesForMandate -- there's no calibration
// data, no must-have clause checklist, and no mandate embedding to recall
// against, so most of that function's machinery doesn't apply here.
// ---------------------------------------------------------------------

export type PromptSearchMatch = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  category: string | null;
  sub_domain: string | null;
};

export type PromptSearchResult =
  | { ok: true; matches: PromptSearchMatch[]; scanned: number }
  | { ok: false; status: number; error: string };

type PromptCandidateRow = {
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
  talent_micro_index: Record<string, unknown> | null;
  ai_summary: string | null;
};

const PROMPT_SELECT_COLUMNS =
  "id, full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, open_to_relocation, notice_period, expected_fixed_ctc, skills, current_industry, industries, talent_micro_index, ai_summary";

export async function matchCandidatesForPrompt(
  prompt: string,
  supabase: SupabaseClient,
  options?: { maxResults?: number }
): Promise<PromptSearchResult> {
  const trimmed = prompt.trim();
  if (!trimmed) return { ok: false, status: 400, error: "Prompt is required" };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "AI search is not configured yet (missing GEMINI_API_KEY on the server)." };
  }

  // Recall pool: semantic recall via the prompt's own embedding (if the
  // candidate table has embeddings populated -- see embed-candidates cron)
  // unioned with a recency-bounded fallback pool, since embeddings are
  // still being backfilled across the historical candidate base and a
  // prompt should still return *something* useful in the meantime.
  const poolById = new Map<string, PromptCandidateRow>();
  const similarityById = new Map<string, number>();

  try {
    const { generateEmbedding } = await import("@/lib/embeddings");
    const promptEmbedding = await generateEmbedding(trimmed);
    if (promptEmbedding) {
      const { data: semanticMatches } = await supabase.rpc("match_candidates", {
        query_embedding: promptEmbedding,
        match_count: 150,
      });
      const ids = ((semanticMatches ?? []) as { id: string; similarity: number }[])
        .filter((m) => m.id)
        .map((m) => {
          similarityById.set(m.id, m.similarity);
          return m.id;
        });
      if (ids.length > 0) {
        const { data: rows } = await supabase.from("candidates").select(PROMPT_SELECT_COLUMNS).in("id", ids);
        for (const r of (rows ?? []) as PromptCandidateRow[]) poolById.set(r.id, r);
      }
    }
  } catch (err) {
    console.error("Semantic recall failed for prompt search", err);
  }

  // Recency fallback / supplement -- bounded pool of the most recently
  // active candidates so a query still returns results even before this
  // candidate's embedding exists yet (fresh registrations, or while the
  // historical backlog is still being backfilled).
  const { data: recentPool, error: poolError } = await supabase
    .from("candidates")
    .select(PROMPT_SELECT_COLUMNS)
    .neq("status", "awaiting_input")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (poolError) return { ok: false, status: 500, error: poolError.message };
  for (const r of (recentPool ?? []) as PromptCandidateRow[]) {
    if (!poolById.has(r.id)) poolById.set(r.id, r);
  }

  const candidates = Array.from(poolById.values());
  if (candidates.length === 0) return { ok: true, matches: [], scanned: 0 };

  // Trim to a sane token budget: semantically-recalled candidates first
  // (already the most relevant), then most-recent as filler.
  const shortlist = candidates
    .sort((a, b) => (similarityById.get(b.id) ?? 0) - (similarityById.get(a.id) ?? 0))
    .slice(0, 200);

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
    talent_micro_index: c.talent_micro_index,
    has_ai_summary: !!c.ai_summary,
  }));

  const genPrompt = `You are a sharp sales recruiter searching an existing candidate database using a free-text request typed by a recruiter -- there is no job requisition attached, just their own words. Score and rank ONLY the candidates given below -- never invent a candidate, employer, skill, or fact not present in their data.

Recruiter's request (verbatim): ${JSON.stringify(trimmed)}

Candidates to evaluate (JSON array):
${JSON.stringify(factSheets, null, 2)}

For EACH candidate, decide if they are a genuine, defensible match for the request. Only include candidates worth surfacing -- omit weak/irrelevant candidates entirely rather than padding the list. If the request implies a hard constraint (e.g. a specific city, an experience range, "must currently be doing X"), treat a clear violation of that constraint as disqualifying unless the candidate is otherwise an exceptionally strong fit, in which case include them but say so plainly in "reason".

Return ONLY a JSON array (no markdown fence, no commentary), one object per included candidate, each with exactly these keys:
- "candidate_id": copy exactly from the input.
- "score": integer 0-100, how well this candidate matches the request.
- "reason": one tight sentence a recruiter would say explaining why this candidate matches (or a caveat), grounded in specific facts from their data, not generic praise.

Sort the array by score descending. Include at most ${options?.maxResults ?? 25} candidates.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(genPrompt);
      const raw = result.response.text().trim();
      const parsed = parseJsonArray(raw) as unknown as { candidate_id: string; score?: number; reason?: string }[] | null;
      if (!parsed) {
        lastError = new Error("Could not parse AI response as JSON");
        continue;
      }

      const rowById = new Map(shortlist.map((c) => [c.id, c]));
      const matches: PromptSearchMatch[] = parsed
        .filter((row) => rowById.has(row.candidate_id))
        .filter((row, i, arr) => arr.findIndex((r) => r.candidate_id === row.candidate_id) === i)
        .map((row) => {
          const c = rowById.get(row.candidate_id)!;
          return {
            candidate_id: row.candidate_id,
            full_name: c.full_name,
            score: typeof row.score === "number" ? row.score : 0,
            reason: row.reason ?? "",
            current_job_title: c.current_job_title,
            current_employer: c.current_employer,
            current_location: c.current_location,
            total_experience_years: c.total_experience_years,
            category: c.category,
            sub_domain: c.sub_domain,
          };
        })
        .sort((a, b) => b.score - a.score);

      return { ok: true, matches, scanned: candidates.length };
    } catch (err) {
      lastError = err;
      console.error(`Gemini prompt search failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has hit its free-tier quota. Try again later or use a paid-tier key."
      : "AI candidate search failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
