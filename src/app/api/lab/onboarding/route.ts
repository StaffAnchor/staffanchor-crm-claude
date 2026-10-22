import { NextRequest, NextResponse } from "next/server";
import { bad, clip, isId, isoDate, managerOnly } from "@/lib/lab/api";

export const dynamic = "force-dynamic";

const PERIODS = ["d30", "d60", "d90"];
const PARTS = ["learn", "do", "prove"];

// New-rep onboarding 30-60-90: one plan per new rep (by ID), with a weekly check log.
export async function POST(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = isId(b.id) ? b.id : null;

  if (id && b.action === "week") {
    const week = Number(b.week);
    if (!Number.isInteger(week) || week < 1 || week > 13) return bad("Unknown week.");
    const { data: cur } = await db.from("lab_onboarding").select("weeks").eq("id", id).eq("member_id", me.member.id).maybeSingle();
    if (!cur) return bad("Plan not found.", 404);
    const entry = { week, well: clip(b.well, 300) ?? "", fix: clip(b.fix, 300) ?? "", support: clip(b.support, 300) ?? "" };
    const weeks = [...(cur.weeks as { week: number }[]).filter((x) => x.week !== week), ...(entry.well || entry.fix || entry.support ? [entry] : [])].sort((x, y) => x.week - y.week);
    await db.from("lab_onboarding").update({ weeks }).eq("id", id);
    return NextResponse.json({ ok: true });
  }

  const repRef = clip(b.repRef, 40);
  if (!repRef) return bad("Enter the new rep's ID or initials.");
  const raw = (b.plan ?? {}) as Record<string, Record<string, unknown>>;
  const plan: Record<string, Record<string, string>> = {};
  for (const p of PERIODS) { plan[p] = {}; for (const part of PARTS) plan[p][part] = clip(raw[p]?.[part], 300) ?? ""; }
  const row = { rep_ref: repRef, started_on: isoDate(b.startedOn) ?? new Date().toISOString().slice(0, 10), plan };
  if (id) {
    await db.from("lab_onboarding").update(row).eq("id", id).eq("member_id", me.member.id);
    return NextResponse.json({ ok: true });
  }
  const { count } = await db.from("lab_onboarding").select("id", { count: "exact", head: true }).eq("member_id", me.member.id);
  if ((count ?? 0) >= 60) return bad("That's the limit of 60 onboarding plans.");
  const { error } = await db.from("lab_onboarding").insert({ member_id: me.member.id, ...row });
  if (error) return bad("Couldn't save. Please try again.", 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return bad("Unknown plan.");
  await w.db.from("lab_onboarding").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
