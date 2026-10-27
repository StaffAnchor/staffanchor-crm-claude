import { NextRequest, NextResponse } from "next/server";
import { COST_FIELDS } from "@/lib/lab/calc";
import { bad, managerOnly } from "@/lib/lab/api";

export const dynamic = "force-dynamic";

// The manager's own numbers for the cost of weak sales management. Plain numbers; blanks are left unanswered.
export async function PUT(req: NextRequest) {
  const w = await managerOnly();
  if (w.error) return w.error;
  const { me, db } = w;
  const b = (await req.json().catch(() => ({}))) as { values?: Record<string, unknown> };
  const vals: Record<string, number | null> = {};
  for (const f of COST_FIELDS) {
    const raw = b.values?.[f.key];
    if (raw === "" || raw == null) { vals[f.key] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1e12) return bad(`Check the number for ${f.label}.`);
    if (f.unit.startsWith("%") && n > 100) return bad(`${f.label} can't be more than 100%.`);
    vals[f.key] = n;
  }
  const { error } = await db.from("lab_cost_inputs").upsert({ member_id: me.member.id, vals, updated_at: new Date().toISOString() }, { onConflict: "member_id" });
  if (error) return bad("Couldn't save. Please try again.", 500);
  return NextResponse.json({ ok: true });
}
