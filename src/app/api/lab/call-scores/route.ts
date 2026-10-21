import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { SCORECARD_DEFAULT } from "@/lib/lab/calc";

export const dynamic = "force-dynamic";

async function who() {
  const me = await currentLabMember();
  const db = adminDb();
  if (!me || me.member.role !== "manager") return { error: NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 }) };
  if (!db) return { error: NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 }) };
  return { me, db };
}

// Adds one scored call. The rep and the call are the manager's own IDs: no names, no recordings, no transcripts.
export async function POST(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as { repRef?: string; callRef?: string; scoredOn?: string; ratings?: Record<string, unknown>; note?: string };
  const repRef = (b.repRef ?? "").trim().slice(0, 40);
  if (!repRef) return NextResponse.json({ ok: false, error: "Enter the rep's ID or initials." }, { status: 400 });
  const ratings: Record<string, number> = {};
  for (const c of SCORECARD_DEFAULT) {
    const r = Number(b.ratings?.[c.key]);
    if (!Number.isInteger(r) || r < 1 || r > 5) return NextResponse.json({ ok: false, error: `Rate ${c.label} from 1 to 5.` }, { status: 400 });
    ratings[c.key] = r;
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.scoredOn ?? "") ? b.scoredOn! : new Date().toISOString().slice(0, 10);
  const { count } = await db.from("lab_call_scores").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 300) return NextResponse.json({ ok: false, error: "That's the limit of 300 scored calls." }, { status: 400 });
  const { error } = await db.from("lab_call_scores").insert({ member_id: me.member.id, rep_ref: repRef, call_ref: (b.callRef ?? "").trim().slice(0, 60) || null, scored_on: date, ratings, note: (b.note ?? "").trim().slice(0, 300) || null });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Unknown call." }, { status: 400 });
  await w.db.from("lab_call_scores").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
