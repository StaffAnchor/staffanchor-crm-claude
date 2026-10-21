import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";

export const dynamic = "force-dynamic";

// A participant marks their own between-session assignment as done (or not).
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { sessionN?: number; done?: boolean; note?: string };
  const n = Number(b.sessionN);
  if (!Number.isInteger(n) || n < 1 || n > 6) return NextResponse.json({ ok: false, error: "Unknown session." }, { status: 400 });
  await db.from("lab_assignments").upsert({ member_id: me.member.id, session_n: n, done: !!b.done, note: typeof b.note === "string" ? b.note.trim().slice(0, 500) || null : null, updated_at: new Date().toISOString() }, { onConflict: "member_id,session_n" });
  return NextResponse.json({ ok: true });
}
