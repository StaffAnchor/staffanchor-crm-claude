import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCandidatesForMandate, matchCandidatesDeterministic } from "@/lib/candidate-match";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { mandateId, extraCriteria, mode, candidateIdsOverride, includeAlreadyLinked, scoreAllProvided, maxResults } = await req.json();
  if (!mandateId) {
    return NextResponse.json({ error: "mandateId is required" }, { status: 400 });
  }

  const hasExtraCriteria = typeof extraCriteria === "string" && extraCriteria.trim().length > 0;
  const hasOverride = Array.isArray(candidateIdsOverride) && candidateIdsOverride.length > 0;
  // "ai" is opt-in (the "Get AI Read" button) -- everything else (including
  // no mode at all) uses the zero-AI deterministic matcher, which is what
  // the Matching Workspace calls by default now. This is the whole point of
  // this route change: matching no longer costs a Gemini call on every
  // page view/click, only when a recruiter explicitly asks for AI judgment
  // on a short, already-narrowed list of finalists.
  const useAi = mode === "ai";

  const matchOptions = {
    ...(hasExtraCriteria ? { extraCriteria } : {}),
    ...(hasOverride ? { candidateIdsOverride } : {}),
    ...(includeAlreadyLinked ? { includeAlreadyLinked: true } : {}),
    ...(scoreAllProvided ? { scoreAllProvided: true } : {}),
    ...(typeof maxResults === "number" ? { maxResults } : {}),
  };
  const finalOptions = Object.keys(matchOptions).length > 0 ? matchOptions : undefined;

  const result = useAi
    ? await matchCandidatesForMandate(mandateId, supabase, finalOptions)
    : await matchCandidatesDeterministic(mandateId, supabase, finalOptions);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Only cache the standard, full-pool run (no ad hoc criteria, no
  // candidate override) as the mandate's persistent auto_match_results --
  // an ad hoc search or an AI-Read-on-finalists run is a one-off probe for
  // the recruiter running it, and must not overwrite the shared cached view
  // every other recruiter/the Mandates list sees for this mandate.
  const isStandardRun = !hasExtraCriteria && !hasOverride;
  if (isStandardRun) {
    await supabase
      .from("mandates")
      .update({ auto_match_results: result.matches, auto_match_computed_at: new Date().toISOString() })
      .eq("id", mandateId);
  }

  return NextResponse.json({
    matches: result.matches,
    scanned: result.scanned,
    calibration: result.calibration,
    requirementsChecked: result.requirementsChecked,
    matchMethod: useAi ? "ai" : "deterministic",
  });
}
