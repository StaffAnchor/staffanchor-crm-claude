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
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { mandateId } = await req.json();
  if (!mandateId) {
    return NextResponse.json({ error: "mandateId is required" }, { status: 400 });
  }

  const result = await matchCandidatesForMandate(mandateId, supabase);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Cache the result on the mandate so it's already there next time someone
  // opens this mandate's page -- both for the manual "Find matches" click
  // and the auto-run fired right after mandate creation.
  await supabase
    .from("mandates")
    .update({ auto_match_results: result.matches, auto_match_computed_at: new Date().toISOString() })
    .eq("id", mandateId);

  return NextResponse.json({ matches: result.matches, scanned: result.scanned, calibration: result.calibration });
}
