import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { askMissingDetails } from "@/lib/ask-missing";

export const runtime = "nodejs";

// "Ask for missing details": a recruiter asks one candidate for exactly what their profile lacks.
// See lib/ask-missing for the channel rules (assistant in the window, approved template, then email).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { candidateId } = (await req.json().catch(() => ({}))) as { candidateId?: string };
  if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });

  const r = await askMissingDetails(admin, user.id, candidateId, { emailFallback: true });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 });
  return NextResponse.json({ ok: true, via: r.via, count: r.count, note: r.note });
}
