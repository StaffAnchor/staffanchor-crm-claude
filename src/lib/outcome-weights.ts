import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScoreBreakdown } from "@/lib/candidate-match";

// The fixed weights the Gemini prompt itself already targets (must_haves_fit
// ~50%, good_to_haves_fit ~10%, experience_fit ~20%, domain_relevance ~20%).
// Used as the fallback whenever we don't yet have enough real outcome data to
// override them -- so a brand-new deployment (or a mandate with no resolved
// pipeline history yet) behaves identically to before this feature existed.
export const DEFAULT_OUTCOME_WEIGHTS: Record<string, number> = {
  must_haves_fit: 0.5,
  good_to_haves_fit: 0.1,
  experience_fit: 0.2,
  domain_relevance: 0.2,
};

export type OutcomeWeights = {
  weights: Record<string, number>;
  sampleSize: number;
  computedAt: string | null;
};

let cached: { value: OutcomeWeights; fetchedAt: number } | null = null;
const CACHE_MS = 5 * 60 * 1000; // one match run fetches this repeatedly per candidate-free call; a 5 min cache avoids a query per mandate-match invocation without ever serving very stale weights.

// Fetches the most recently computed outcome-derived weights (written by
// api/cron/outcome-reweight-sweep), or falls back to the fixed defaults if
// none exist yet. This is deliberately NOT a black-box learned model --
// weights are plain, inspectable numbers a recruiter or engineer can read
// straight out of the matching_reweight_config table.
export async function getLatestOutcomeWeights(supabase: SupabaseClient): Promise<OutcomeWeights> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) return cached.value;

  try {
    const { data } = await supabase
      .from("matching_reweight_config")
      .select("weights, sample_size, computed_at")
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const value: OutcomeWeights = data
      ? {
          weights: data.weights as Record<string, number>,
          sampleSize: data.sample_size as number,
          computedAt: data.computed_at as string,
        }
      : { weights: DEFAULT_OUTCOME_WEIGHTS, sampleSize: 0, computedAt: null };

    cached = { value, fetchedAt: Date.now() };
    return value;
  } catch {
    // Best-effort -- a lookup failure should never block matching.
    return { weights: DEFAULT_OUTCOME_WEIGHTS, sampleSize: 0, computedAt: null };
  }
}

// Applies the (possibly outcome-adjusted) weights to one candidate's score
// breakdown. This is a re-rank signal ONLY -- it never replaces or hides
// Gemini's own reported "score", it just gives a second number, grounded in
// what has actually converted to placements/interviews on this system before,
// to break ties and (once enough data exists) nudge ordering.
export function outcomeAdjustedScore(
  breakdown: ScoreBreakdown | null,
  weights: Record<string, number>
): number | null {
  if (!breakdown) return null;
  const w = weights;
  const total =
    (w.must_haves_fit ?? 0) + (w.good_to_haves_fit ?? 0) + (w.experience_fit ?? 0) + (w.domain_relevance ?? 0);
  if (total <= 0) return null;
  const raw =
    breakdown.must_haves_fit * (w.must_haves_fit ?? 0) +
    breakdown.good_to_haves_fit * (w.good_to_haves_fit ?? 0) +
    breakdown.experience_fit * (w.experience_fit ?? 0) +
    breakdown.domain_relevance * (w.domain_relevance ?? 0);
  return Math.round(raw / total);
}
