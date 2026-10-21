import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { MEASURES } from "@/lib/lab/calc";

export const dynamic = "force-dynamic";

// Saves one participant's own baseline or endline figures. Percentages are plain numbers (72 for 72%).
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { phase?: string; values?: Record<string, { value?: unknown; period?: unknown; source?: unknown; note?: unknown }> };
  if (b.phase !== "baseline" && b.phase !== "endline") return NextResponse.json({ ok: false, error: "Unknown phase." }, { status: 400 });
  const rows: Record<string, unknown>[] = [];
  for (const m of MEASURES) {
    const v = b.values?.[m.key];
    if (!v) continue;
    const raw = v.value === "" || v.value == null ? null : Number(v.value);
    if (raw != null && (!Number.isFinite(raw) || raw < 0 || raw > 100000)) return NextResponse.json({ ok: false, error: `Check the number for ${m.label}.` }, { status: 400 });
    const cap = m.key === "forecast_accuracy" ? 300 : 100; // accuracy above 100 means the actual beat the commit
    if (raw != null && raw > cap) return NextResponse.json({ ok: false, error: `${m.label} can't be more than ${cap}.` }, { status: 400 });
    const text = (x: unknown, n: number) => (typeof x === "string" ? x.trim().slice(0, n) : "") || null;
    rows.push({ member_id: me.member.id, measure_key: m.key, phase: b.phase, value: raw, period: text(v.period, 60), source: text(v.source, 120), note: text(v.note, 300), updated_at: new Date().toISOString() });
  }
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "Nothing to save." }, { status: 400 });
  const { error } = await db.from("lab_measure_values").upsert(rows, { onConflict: "member_id,measure_key,phase" });
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: `${b.phase}_saved` });
  return NextResponse.json({ ok: true });
}
