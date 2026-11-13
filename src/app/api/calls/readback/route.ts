import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { readBackNote } from "@/lib/call-readback";

export const runtime = "nodejs";
export const maxDuration = 30;

// Shows a recruiter what the system will remember from their rough note, before the call is saved. Saves nothing.
export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { candidateId?: string; note?: string };
  if (!/^[0-9a-f-]{36}$/i.test(body.candidateId ?? "") || typeof body.note !== "string") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await readBackNote({ candidateId: body.candidateId!, note: body.note });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, readBack: r.readBack });
}
