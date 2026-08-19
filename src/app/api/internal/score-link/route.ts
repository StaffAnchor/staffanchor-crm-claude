import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { matchCandidatesForMandate, buildMatchAssessment } from "@/lib/candidate-match";

export const runtime = "nodejs";

// Fired by a Postgres trigger (fn_notify_new_candidate_mandate_link, see
// migration add_auto_score_new_pipeline_links) the instant ANY new
// candidate_mandate_links row is inserted with no match_score already
// attached -- covers every path a candidate can end up on a mandate's
// pipeline (candidate self-applies via jobs.staffanchor.com Quick Apply,
// a vendor submits them, or a recruiter adds them manually/in bulk/via
// LinkedIn sourcing), not just the Matching Workspace's own "Add to
// pipeline" button. That's why this can't be a normal staff-cookie-authed
// route like /api/mandate-match: the caller here is Postgres itself (via
// pg_net), so it authenticates with a shared secret instead.
export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  const { mandate_id: mandateId, candidate_id: candidateId } = await req.json();
  if (!secret || !mandateId || !candidateId) {
    return NextResponse.json({ error: "Missing secret or ids" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Silent no-op, not an error -- a missing score is far less bad than a
    // trigger-fired background call blowing up a deploy that hasn't set
    // this yet. The manual "Score pipeline" button still covers backfill.
    return NextResponse.json({ ok: false, skipped: "not configured" });
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  // The shared secret lives in Supabase (internal_secrets table, RLS-locked
  // to service role only), not a Vercel env var -- this endpoint is only
  // ever called by the DB trigger itself (see migration
  // add_auto_score_new_pipeline_links), so both sides of the handshake can
  // live in the one place already fully under this deploy's control.
  const { data: secretRow } = await admin
    .from("internal_secrets")
    .select("value")
    .eq("key", "score_link_secret")
    .maybeSingle();
  if (!secretRow?.value || secret !== secretRow.value) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await matchCandidatesForMandate(mandateId, admin, {
      candidateIdsOverride: [candidateId],
      includeAlreadyLinked: true,
      maxResults: 1,
      // Without this, the model can silently decide this one candidate
      // isn't "worth surfacing" and return an empty array -- leaving a
      // real pipeline candidate (an actual applicant) with no score at
      // all instead of an honest low one.
      scoreAllProvided: true,
    });
    if (!result.ok || result.matches.length === 0) {
      return NextResponse.json({ ok: true, scored: false });
    }
    const m = result.matches[0];
    const { error } = await admin
      .from("candidate_mandate_links")
      .update({
        match_score: m.score,
        match_score_breakdown: m.score_breakdown,
        match_embedding_similarity: m.embedding_similarity,
        match_source: "auto_on_link",
        matched_at: new Date().toISOString(),
        match_assessment: buildMatchAssessment(m),
      })
      .eq("mandate_id", mandateId)
      .eq("candidate_id", candidateId);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, scored: true, score: m.score });
  } catch (err) {
    // Best-effort background scoring -- never let a Gemini hiccup surface
    // as a failed application. The manual "Score pipeline" button on the
    // mandate page can always backfill this candidate later.
    console.error("Auto-score-on-link failed", mandateId, candidateId, err);
    return NextResponse.json({ ok: false, error: "scoring failed" });
  }
}
