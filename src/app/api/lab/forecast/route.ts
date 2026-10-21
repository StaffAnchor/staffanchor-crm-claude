import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";

export const dynamic = "force-dynamic";

type In = { month?: unknown; commit?: unknown; bestCase?: unknown; actual?: unknown; why?: unknown };
const numOrNull = (v: unknown): number | null | "bad" => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? n : "bad";
};

// Saves a manager's own forecast record: the months they list (commit at month start, best case, actual, why the gap).
// Months left out of the list are removed, so the page is the whole record.
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { unit?: string; months?: In[] };
  const months = Array.isArray(b.months) ? b.months.slice(0, 36) : [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const m of months) {
    const month = typeof m.month === "string" && /^\d{4}-\d{2}$/.test(m.month) ? `${m.month}-01` : null;
    if (!month) return NextResponse.json({ ok: false, error: "Pick a month for every row." }, { status: 400 });
    if (seen.has(month)) return NextResponse.json({ ok: false, error: "Each month can appear only once." }, { status: 400 });
    seen.add(month);
    const commit = numOrNull(m.commit), best = numOrNull(m.bestCase), actual = numOrNull(m.actual);
    if (commit === "bad" || best === "bad" || actual === "bad") return NextResponse.json({ ok: false, error: "Enter plain numbers, with no commas or units." }, { status: 400 });
    rows.push({ member_id: me.member.id, month, commit, best_case: best, actual, why: typeof m.why === "string" ? m.why.trim().slice(0, 300) || null : null, updated_at: new Date().toISOString() });
  }
  if (rows.length) {
    const { error } = await db.from("lab_forecast_months").upsert(rows, { onConflict: "member_id,month" });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  }
  const keep = [...seen];
  const { data: existing } = await db.from("lab_forecast_months").select("month").eq("member_id", me.member.id);
  const drop = ((existing ?? []) as { month: string }[]).map((r) => r.month).filter((m) => !keep.includes(m));
  if (drop.length) await db.from("lab_forecast_months").delete().eq("member_id", me.member.id).in("month", drop);
  const unit = typeof b.unit === "string" ? b.unit.trim().slice(0, 30) : "";
  await db.from("lab_members").update({ profile: { ...me.member.profile, forecast_unit: unit } }).eq("id", me.member.id);
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: "forecast_saved" });
  return NextResponse.json({ ok: true });
}
