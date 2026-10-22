import { NextRequest, NextResponse } from "next/server";
import { bad, clip, isoDate, managerOnly } from "@/lib/lab/api";

export const dynamic = "force-dynamic";

// The 90-Day Improvement Charter: up to three priorities, each one habit to improve and how it was tested.
export async function PUT(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as { items?: Record<string, unknown>[] };
  const items = (Array.isArray(b.items) ? b.items : []).slice(0, 3);
  const rows = items.map((r, i) => ({
    member_id: me.member.id, position: i + 1,
    problem: clip(r.problem, 400), evidence: clip(r.evidence, 300), baseline: clip(r.baseline, 300), desired: clip(r.desired, 300),
    experiment: clip(r.experiment, 400), owner: clip(r.owner, 80), review_on: isoDate(r.reviewOn), result: clip(r.result, 500), next_step: clip(r.nextStep, 300),
    updated_at: new Date().toISOString(),
  }));
  const { error } = await db.from("lab_charter_items").upsert(rows, { onConflict: "member_id,position" });
  if (error) return bad("Couldn't save. Please try again.", 500);
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: "charter_saved" });
  return NextResponse.json({ ok: true });
}
