import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/cv-facts";
import { checkCandidateForMandate } from "@/lib/ai-match";

// Checks one applicant against this role's requirements for the triage
// screen: evidence, doubts and the question to ask for each doubt.
export const maxDuration = 120;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { candidateId } = await req.json();
  if (typeof candidateId !== "string") return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  // Only people already in this role's pipeline can be checked from here.
  const { data: link } = await supabase.from("candidate_mandate_links").select("id").eq("mandate_id", id).eq("candidate_id", candidateId).maybeSingle();
  if (!link) return NextResponse.json({ error: "That candidate isn't in this role's pipeline." }, { status: 404 });

  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "Server isn't configured (missing service key)." }, { status: 503 });
  const result = await checkCandidateForMandate(id, candidateId, admin);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });
  return NextResponse.json({ ...result.result, cached: result.cached });
}
