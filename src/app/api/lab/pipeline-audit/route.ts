import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { AUDIT_CHECKS } from "@/lib/lab/calc";

export const dynamic = "force-dynamic";

type In = { position?: unknown; dealRef?: unknown; answers?: unknown; action?: unknown };

// Saves a manager's own Pipeline Audit: up to 10 deals, each a CRM deal ID plus nine yes/no checks. An empty row is
// removed. Nothing but the deal ID is kept about the deal, so no customer names or values are stored.
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { deals?: In[] };
  const deals = Array.isArray(b.deals) ? b.deals.slice(0, 10) : [];
  const keep: Record<string, unknown>[] = [];
  const drop: number[] = [];
  for (const d of deals) {
    const pos = Number(d.position);
    if (!Number.isInteger(pos) || pos < 1 || pos > 10) continue;
    const ref = typeof d.dealRef === "string" ? d.dealRef.trim().slice(0, 60) : "";
    const raw = Array.isArray(d.answers) ? d.answers : [];
    const answers = AUDIT_CHECKS.map((_, i) => (raw[i] === true ? true : raw[i] === false ? false : null));
    const action = typeof d.action === "string" ? d.action.trim().slice(0, 300) : "";
    if (!ref && !action && answers.every((a) => a === null)) drop.push(pos);
    else keep.push({ member_id: me.member.id, position: pos, deal_ref: ref || null, answers, action: action || null, updated_at: new Date().toISOString() });
  }
  if (keep.length) {
    const { error } = await db.from("lab_audit_deals").upsert(keep, { onConflict: "member_id,position" });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  }
  if (drop.length) await db.from("lab_audit_deals").delete().eq("member_id", me.member.id).in("position", drop);
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: "pipeline_audit_saved" });
  return NextResponse.json({ ok: true });
}
