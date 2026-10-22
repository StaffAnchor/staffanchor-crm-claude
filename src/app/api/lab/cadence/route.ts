import { NextRequest, NextResponse } from "next/server";
import { bad, clip, isId, isoDate, managerOnly } from "@/lib/lab/api";

export const dynamic = "force-dynamic";

// Follow-up Cadence. PUT saves the manager's standard by stage (the list is the whole record). POST saves one weekly
// check: of the deals sampled, how many had a dated next step.
export async function PUT(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as { rules?: Record<string, unknown>[] };
  const rules = (Array.isArray(b.rules) ? b.rules : []).slice(0, 12).map((r, i) => ({
    member_id: me.member.id, position: i + 1,
    stage: clip(r.stage, 60), within_time: clip(r.within, 60), channel: clip(r.channel, 80), purpose: clip(r.purpose, 160), owner: clip(r.owner, 60), quiet_rule: clip(r.quiet, 160),
  })).filter((r) => r.stage);
  const numbered = rules.map((r, i) => ({ ...r, position: i + 1 }));
  if (numbered.length) {
    const { error } = await db.from("lab_cadence_rules").upsert(numbered, { onConflict: "member_id,position" });
    if (error) return bad("Couldn't save. Please try again.", 500);
  }
  await db.from("lab_cadence_rules").delete().eq("member_id", me.member.id).gt("position", numbered.length);
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sampled = Number(b.sampled), next = Number(b.withNextStep);
  const week = isoDate(b.weekEnding);
  if (!week) return bad("Pick the week ending date.");
  if (!Number.isInteger(sampled) || !Number.isInteger(next) || sampled < 1 || sampled > 1000 || next < 0) return bad("Enter how many deals you sampled and how many had a dated next step.");
  if (next > sampled) return bad("Deals with a next step can't be more than the deals sampled.");
  const { error } = await db.from("lab_cadence_checks").upsert({ member_id: me.member.id, week_ending: week, sampled, with_next_step: next, reason: clip(b.reason, 300), fix: clip(b.fix, 300) }, { onConflict: "member_id,week_ending" });
  if (error) return bad("Couldn't save. Please try again.", 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return bad("Unknown week.");
  await w.db.from("lab_cadence_checks").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
