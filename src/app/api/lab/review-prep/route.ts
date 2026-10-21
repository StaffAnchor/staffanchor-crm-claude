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

// Saves one review preparation (new, or an edit when an id is given), or just flips "follow-up done".
export async function POST(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && /^[0-9a-f-]{36}$/i.test(b.id) ? b.id : null;

  if (id && b.action === "followed_up") {
    await db.from("lab_review_preps").update({ followed_up: b.value === true }).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const cause = ROOT_CAUSES.some((c) => c.key === b.rootCause) ? (b.rootCause as string) : null;
  const row = {
    member_id: me.member.id,
    met_on: date(b.metOn) ?? new Date().toISOString().slice(0, 10),
    report_used: text(b.reportUsed, 160), exceptions: text(b.exceptions, 600), changed: text(b.changed, 600),
    root_cause: cause, decision: text(b.decision, 400), owner_support: text(b.ownerSupport, 300),
    action_logged: b.actionLogged === true ? true : b.actionLogged === false ? false : null,
    follow_up_on: date(b.followUpOn),
  };
  if (!row.exceptions && !row.decision) return NextResponse.json({ ok: false, error: "Add at least the exceptions or the decision needed." }, { status: 400 });
  if (id) {
    await db.from("lab_review_preps").update(row).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const { count } = await db.from("lab_review_preps").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 200) return NextResponse.json({ ok: false, error: "That's the limit of 200 saved reviews." }, { status: 400 });
  const { error } = await db.from("lab_review_preps").insert(row);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Unknown review." }, { status: 400 });
  await w.db.from("lab_review_preps").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
