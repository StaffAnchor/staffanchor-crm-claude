import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { ONE_ON_ONE_SEGMENTS } from "@/lib/lab/calc";

export const dynamic = "force-dynamic";

async function who() {
  const me = await currentLabMember();
  const db = adminDb();
  if (!me || me.member.role !== "manager") return { error: NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 }) };
  if (!db) return { error: NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 }) };
  return { me, db };
}
const text = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Saves one one-on-one (new, or an edit when an id is given), or just records whether the commitment was done by the
// agreed date.
export async function POST(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;

  if (id && b.action === "done") {
    await db.from("lab_oneonones").update({ done: b.value === true ? true : b.value === false ? false : null }).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const repRef = text(b.repRef, 40);
  if (!repRef) return NextResponse.json({ ok: false, error: "Enter the rep's ID or initials." }, { status: 400 });
  const notes: Record<string, string> = {};
  const raw = (b.notes ?? {}) as Record<string, unknown>;
  for (const s of ONE_ON_ONE_SEGMENTS) notes[s.key] = typeof raw[s.key] === "string" ? (raw[s.key] as string).trim().slice(0, 600) : "";
  const row = { member_id: me.member.id, held_on: date(b.heldOn) ?? new Date().toISOString().slice(0, 10), rep_ref: repRef, notes, commitment: text(b.commitment, 400), due_on: date(b.dueOn), my_follow_up: text(b.myFollowUp, 300) };
  if (id) {
    await db.from("lab_oneonones").update(row).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const { count } = await db.from("lab_oneonones").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 400) return NextResponse.json({ ok: false, error: "That's the limit of 400 saved one-on-ones." }, { status: 400 });
  const { error } = await db.from("lab_oneonones").insert(row);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Unknown one-on-one." }, { status: 400 });
  await w.db.from("lab_oneonones").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
