import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { PLAN_OUTCOMES, reviewsFor, type PlanReview } from "@/lib/lab/calc";

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
const ID = /^[0-9a-f-]{36}$/i;

// A manager's own performance plans. The text is private to the manager: it is only ever read back to them, and the
// cohort views count plans without showing any of it. Use with HR and inside the company's own policy.
export async function POST(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof b.id === "string" && ID.test(b.id) ? b.id : null;

  if (id && (b.action === "review" || b.action === "outcome")) {
    const { data: plan } = await db.from("lab_perf_plans").select("reviews").eq("id", id).eq("member_id", me.member.id).maybeSingle();
    if (!plan) return NextResponse.json({ ok: false, error: "Plan not found." }, { status: 404 });
    if (b.action === "outcome") {
      if (!PLAN_OUTCOMES.some((o) => o.key === b.outcome)) return NextResponse.json({ ok: false, error: "Unknown outcome." }, { status: 400 });
      await db.from("lab_perf_plans").update({ outcome: b.outcome }).eq("id", id);
      return NextResponse.json({ ok: true });
    }
    const day = Number(b.day);
    const reviews = (plan.reviews as PlanReview[]).map((r) => (r.day === day ? { ...r, done: b.done === true, status: ["on_track", "at_risk", "off_track"].includes(String(b.status)) ? (b.status as PlanReview["status"]) : r.status } : r));
    await db.from("lab_perf_plans").update({ reviews }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const repRef = text(b.repRef, 40);
  if (!repRef) return NextResponse.json({ ok: false, error: "Enter the rep's ID or initials." }, { status: 400 });
  const gap = text(b.gap, 600), standard = text(b.standard, 400), support = text(b.support, 400);
  if (!gap || !standard) return NextResponse.json({ ok: false, error: "Add the gap (a fact) and the expected standard in 30 days." }, { status: 400 });
  const started = date(b.startedOn) ?? new Date().toISOString().slice(0, 10);
  if (id) {
    // Editing keeps the review progress; the checkpoints are only re-dated if the start date moved.
    const { data: cur } = await db.from("lab_perf_plans").select("started_on, reviews").eq("id", id).eq("member_id", me.member.id).maybeSingle();
    if (!cur) return NextResponse.json({ ok: false, error: "Plan not found." }, { status: 404 });
    const reviews = cur.started_on === started ? cur.reviews : (cur.reviews as PlanReview[]).map((r, i) => ({ ...r, due: reviewsFor(started)[i].due }));
    await db.from("lab_perf_plans").update({ rep_ref: repRef, started_on: started, gap, standard, support, reviews }).eq("id", id);
    return NextResponse.json({ ok: true });
  }
  const { count } = await db.from("lab_perf_plans").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 100) return NextResponse.json({ ok: false, error: "That's the limit of 100 saved plans." }, { status: 400 });
  const { error } = await db.from("lab_perf_plans").insert({ member_id: me.member.id, rep_ref: repRef, started_on: started, gap, standard, support, reviews: reviewsFor(started) });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await who();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!ID.test(id)) return NextResponse.json({ ok: false, error: "Unknown plan." }, { status: 400 });
  await w.db.from("lab_perf_plans").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
