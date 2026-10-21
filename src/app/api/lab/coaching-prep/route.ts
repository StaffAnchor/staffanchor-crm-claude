import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { ROOT_CAUSES } from "@/lib/lab/calc";

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

// Saves one coaching preparation (new, or an edit when an id is given), or just flips "follow-up done".
export async function POST(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;

  if (id && b.action === "followed_up") {
    await db.from("lab_coaching_preps").update({ followed_up: b.value === true }).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const repRef = text(b.repRef, 40);
  if (!repRef) return NextResponse.json({ ok: false, error: "Enter the rep's ID or initials." }, { status: 400 });
  const row = {
    member_id: me.member.id,
    coached_on: date(b.coachedOn) ?? new Date().toISOString().slice(0, 10),
    rep_ref: repRef, record_ref: text(b.recordRef, 80), observed: text(b.observed, 600),
    gap: ROOT_CAUSES.some((c) => c.key === b.gap) ? (b.gap as string) : null,
    question: text(b.question, 400), practice: text(b.practice, 400), commitment: text(b.commitment, 400),
    follow_up_note: text(b.followUpNote, 300), follow_up_on: date(b.followUpOn),
  };
  if (!row.observed) return NextResponse.json({ ok: false, error: "Describe the observed behaviour as a fact." }, { status: 400 });
  if (id) {
    await db.from("lab_coaching_preps").update(row).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const { count } = await db.from("lab_coaching_preps").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 300) return NextResponse.json({ ok: false, error: "That's the limit of 300 saved conversations." }, { status: 400 });
  const { error } = await db.from("lab_coaching_preps").insert(row);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Unknown conversation." }, { status: 400 });
  await w.db.from("lab_coaching_preps").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
