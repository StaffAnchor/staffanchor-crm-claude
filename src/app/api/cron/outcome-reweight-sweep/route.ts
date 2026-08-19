import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_OUTCOME_WEIGHTS } from "@/lib/outcome-weights";
import { withHeartbeat } from "@/lib/cron-heartbeat";

// Closes the loop the rest of the matching engine has never had: every
// candidate_mandate_links row now carries a snapshot of the match score
// components it had when it was added (match_score_breakdown), and the same
// row's `stage` column is the actual outcome -- rejected, placed, or
// somewhere in between. This sweep asks Postgres directly (via the
// compute_outcome_correlations() SQL function, see migration
// add_compute_outcome_correlations_rpc) how well each of the four score
// components (must_haves_fit, good_to_haves_fit, experience_fit,
// domain_relevance) actually correlates with a candidate progressing further
// through the pipeline, and -- only once there's enough resolved data to
// trust it -- writes a new set of weights to matching_reweight_config for
// candidate-match.ts to blend into its ranking (see outcome-weights.ts).
//
// This never touches Gemini, costs $0, and is intentionally simple: no
// hidden model, just Pearson correlations turned into normalized weights.
// Every number it produces is inspectable straight out of the
// matching_reweight_config table.
export const maxDuration = 30;

// Below this many resolved (non-sourced/screened) outcomes, correlations are
// too noisy to act on -- skip writing a new config row and let matching keep
// using whatever it was already using (the fixed defaults, or the last
// config that did clear this bar).
const MIN_SAMPLE_SIZE = 20;

// A raw correlation can come back negative or near-zero for a genuinely
// predictive feature just from small-sample noise. Floor every feature at a
// small positive weight rather than letting one bad quarter zero out (or
// invert) a component entirely -- this is a nudge on top of the existing
// formula, not a replacement for it.
const MIN_FEATURE_WEIGHT = 0.05;

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const { data, error } = await admin.rpc("compute_outcome_correlations").single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data as {
    sample_size: number;
    corr_must_haves: number | null;
    corr_good_to_haves: number | null;
    corr_experience: number | null;
    corr_domain: number | null;
    corr_embedding: number | null;
  };

  const sampleSize = Number(row.sample_size ?? 0);
  if (sampleSize < MIN_SAMPLE_SIZE) {
    return NextResponse.json({
      ok: true,
      wroteNewWeights: false,
      sampleSize,
      minSampleSize: MIN_SAMPLE_SIZE,
      reason: "Not enough resolved pipeline outcomes yet -- matching keeps using the existing weights.",
    });
  }

  // corr() returns nulls for a feature with zero variance (e.g. every
  // candidate scored 100 on it) -- treat that as "no signal either way"
  // rather than crashing the floor/normalize step below.
  const raw: Record<string, number> = {
    must_haves_fit: row.corr_must_haves ?? 0,
    good_to_haves_fit: row.corr_good_to_haves ?? 0,
    experience_fit: row.corr_experience ?? 0,
    domain_relevance: row.corr_domain ?? 0,
  };

  // Floor negatives/near-zero at MIN_FEATURE_WEIGHT, then normalize so the
  // four weights sum to 1 -- same shape as DEFAULT_OUTCOME_WEIGHTS, just
  // re-derived from what has actually predicted a candidate moving forward
  // on real mandates instead of the fixed 50/10/20/20 split.
  const floored = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Math.max(v, MIN_FEATURE_WEIGHT)])
  ) as Record<string, number>;
  const total = Object.values(floored).reduce((a, b) => a + b, 0);
  const weights = Object.fromEntries(Object.entries(floored).map(([k, v]) => [k, Math.round((v / total) * 1000) / 1000]));

  await admin.from("matching_reweight_config").insert({
    sample_size: sampleSize,
    weights,
    notes: `Auto-computed from ${sampleSize} resolved candidate_mandate_links outcomes. Raw correlations: ${JSON.stringify(
      raw
    )}. Embedding-similarity correlation (informational only, not yet blended into weights): ${row.corr_embedding ?? "n/a"
    }. Default (pre-data) weights were ${JSON.stringify(DEFAULT_OUTCOME_WEIGHTS)}.`,
  });

  return NextResponse.json({ ok: true, wroteNewWeights: true, sampleSize, weights, rawCorrelations: raw });
}

export const GET = withHeartbeat("outcome-reweight-sweep", 1440, handler);
