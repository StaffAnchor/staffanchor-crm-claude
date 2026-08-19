import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { matchCandidatesForPrompt } from "@/lib/candidate-match";

// Global "prompt window" search -- a recruiter types a free-text ask
// ("B2B SaaS AEs in Bangalore, 4-7 years, hunting not farming") and gets
// ranked candidates back from the WHOLE database, with no mandate
// attached. Distinct from /api/mandate-match, which scores against one
// mandate's JD/must-haves.
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

  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string") {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const result = await matchCandidatesForPrompt(prompt, supabase);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ matches: result.matches, scanned: result.scanned });
}
