import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refineJd } from "@/lib/generate-jd";

// Applies one targeted instruction (e.g. "shorten the responsibilities" or
// "add a requirement about SaaS experience") to an already-written JD,
// instead of the full-regeneration /api/generate-jd does from rough notes.
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

  const body = await req.json();
  const result = await refineJd({
    overview: body.overview ?? "",
    responsibilities: Array.isArray(body.responsibilities) ? body.responsibilities : [],
    candidate_profile: Array.isArray(body.candidate_profile) ? body.candidate_profile : [],
    compensation_benefits: Array.isArray(body.compensation_benefits) ? body.compensation_benefits : [],
    instruction: body.instruction ?? "",
    client_name: body.client_name ?? "",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.jd);
}
