import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/cv-facts";
import { runAiMatchForMandate } from "@/lib/ai-match";

// Runs the AI match for one role now: checks the next best candidates from
// the bank against the role's requirements and stores the results. Press
// again to check the next batch.
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }
  const admin = getServiceClient();
  if (!admin) return NextResponse.json({ error: "Server isn't configured for matching (missing service key)." }, { status: 503 });
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ error: "AI isn't configured yet (no AI provider key on the server)." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(40, Math.max(5, Number(body.limit) || 30));
  const result = await runAiMatchForMandate(id, admin, { limit });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
