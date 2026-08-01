import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCandidatesForMandate } from "@/lib/candidate-match";

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

  const { mandateId, extraCriteria } = await req.json();
  if (!mandateId) {
    return NextResponse.json({ error: "mandateId is required" }, { status: 400 });
  }

  const hasExtraCriteria = typeof extraCriteria === "string" && extraCriteria.trim().length > 0;

  const result = await matchCandidatesForMandate(mandateId, supabase, hasExtraCriteria ? { extraCriteria } : undefined);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Only cache the standard (no ad hoc criteria) run as the mandate's
  // persistent auto_match_results -- an ad hoc search is a one-off "what if
  // I also required X" probe for the recruiter running it, and must not
  // overwrite the shared cached view every other recruiter/the Mandates
  // list sees for this mandate.
  if (!hasExtraCriteria) {
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
  });
}
