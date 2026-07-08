import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";

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

  const { candidateId } = await req.json();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const result = await generateAiPassportForCandidate(candidateId, supabase, { actor: user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ summary: result.summary, passport: result.passport });
}
