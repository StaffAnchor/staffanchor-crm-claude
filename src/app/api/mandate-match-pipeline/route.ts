import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCandidatesForMandate } from "@/lib/candidate-match";

// "Score pipeline" -- the sibling of /api/mandate-match, but scores the
// candidates a recruiter has ALREADY added to this mandate (via bulk
// sourcing, quick-apply, manual add, LinkedIn sourcing, etc.) instead of
// suggesting new ones from the wider pool. Most candidates never went
// through the Matching Workspace's "Add to pipeline" action, so they never
// got a match_score snapshotted onto their candidate_mandate_links row --
// this backfills it in one click instead of requiring a recruiter to
// re-find each of them in the matching workspace individually.
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { mandateId } = await req.json();
  if (!mandateId) {
    return NextResponse.json({ error: "mandateId is required" }, { status: 400 });
  }

  const { data: links, error: linksError } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id")
    .eq("mandate_id", mandateId);
  if (linksError) {
    return NextResponse.json({ error: linksError.message }, { status: 500 });
  }

  // Bounded the same way the standard SQL-prefilter pool is (150) -- keeps
  // the Gemini call's token budget sane even on a mandate with a very large
  // pipeline. Most recently linked first, so a capped run still covers the
  // candidates a recruiter is most likely actively working right now.
  const allIds = (links ?? []).map((l) => l.candidate_id as string);
  const candidateIds = allIds.slice(0, 150);
  if (candidateIds.length === 0) {
    return NextResponse.json({ error: "No candidates in this mandate's pipeline yet." }, { status: 400 });
  }

  const result = await matchCandidatesForMandate(mandateId, supabase, {
    candidateIdsOverride: candidateIds,
    includeAlreadyLinked: true,
    // Pipeline scoring wants coverage across the whole (already bounded,
    // already-qualified-by-being-in-the-pipeline) set, not just the usual
    // top-20-worth-suggesting-as-new cap.
    maxResults: Math.min(candidateIds.length, 100),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Gemini's "include at most N" is a prompt instruction, not an enforced
  // limit -- it has been observed returning more entries than asked for,
  // including the same candidate_id more than once. Dedupe (keeping the
  // first/highest-scored occurrence, since matches are already sorted
  // desc) before writing anything, so the "scored X of Y" count reported
  // back can never exceed the actual pipeline size.
  const seen = new Set<string>();
  const dedupedMatches = result.matches.filter((m) => {
    if (seen.has(m.candidate_id)) return false;
    seen.add(m.candidate_id);
    return true;
  });

  // Snapshot each returned score onto the candidate's existing
  // candidate_mandate_links row -- same fields addToPipeline() writes on a
  // fresh add, so this candidate now looks identical (for scoring purposes)
  // to one added straight from the Matching Workspace, and feeds the same
  // outcome-reweight-sweep training signal.
  const nowIso = new Date().toISOString();
  let scored = 0;
  for (const m of dedupedMatches) {
    const { error } = await supabase
      .from("candidate_mandate_links")
      .update({
        match_score: m.score,
        match_score_breakdown: m.score_breakdown,
        match_embedding_similarity: m.embedding_similarity,
        match_source: "pipeline_backfill",
        matched_at: nowIso,
      })
      .eq("mandate_id", mandateId)
      .eq("candidate_id", m.candidate_id);
    if (!error) scored += 1;
  }

  return NextResponse.json({
    scored,
    consideredCount: candidateIds.length,
    truncated: allIds.length > candidateIds.length,
  });
}
