import { NextRequest, NextResponse } from "next/server";
import { ROOT_CAUSES } from "@/lib/lab/calc";
import { bad, clip, isId, isoDate, managerOnly } from "@/lib/lab/api";

export const dynamic = "force-dynamic";

// A five-minute note after the manager's regular team review. One note per week ending: saving again updates it.
export async function POST(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const week = isoDate(b.weekEnding);
  if (!week) return bad("Pick the week ending date.");
  const mattered = clip(b.mattered, 500);
  if (!mattered) return bad("Say what mattered most this week.");
  const { error } = await db.from("lab_reflections").upsert({
    member_id: me.member.id, week_ending: week, mattered, evidence: clip(b.evidence, 300), slipped: clip(b.slipped, 500),
    cause: ROOT_CAUSES.some((c) => c.key === b.cause) ? (b.cause as string) : null, action: clip(b.action, 400), help_from: clip(b.helpFrom, 200), check_next: clip(b.checkNext, 300),
  }, { onConflict: "member_id,week_ending" });
  if (error) return bad("Couldn't save. Please try again.", 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const id = new URL(req.url).searchParams.get("id");
  if (!isId(id)) return bad("Unknown note.");
  await w.db.from("lab_reflections").delete().eq("id", id).eq("member_id", w.me.member.id);
  return NextResponse.json({ ok: true });
}
