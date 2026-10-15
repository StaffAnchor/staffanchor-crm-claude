import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { askMissingDetails, previewAsk } from "@/lib/ask-missing";

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

  const body = (await req.json().catch(() => ({}))) as { candidateId?: string; preview?: boolean; only?: unknown };
  const candidateId = body.candidateId;
  if (!candidateId) return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  const only = Array.isArray(body.only) ? body.only.filter((x): x is string => typeof x === "string") : undefined;

  // The review step: show exactly what would go out, send nothing.
  if (body.preview === true) {
    const pv = await previewAsk(admin, candidateId, only);
    return NextResponse.json(pv.ok ? { ok: true, preview: pv.preview } : { ok: false, error: pv.error }, { status: 200 });
  }

  const r = await askMissingDetails(admin, user.id, candidateId, { emailFallback: true, only });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 200 });
  return NextResponse.json({ ok: true, via: r.via, count: r.count, note: r.note });
}
