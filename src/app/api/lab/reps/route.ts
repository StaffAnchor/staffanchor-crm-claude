import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";

export const dynamic = "force-dynamic";

type In = { repRef?: unknown; tenureMonths?: unknown; output?: unknown };

// Saves a manager's own list of reps for banding: ID, tenure in months and monthly output. The list on the page is the
// whole record, so reps left out are removed. Only IDs are kept, never names.
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { unit?: string; reps?: In[] };
  const list = Array.isArray(b.reps) ? b.reps.slice(0, 60) : [];
  const rows: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const r of list) {
    const ref = typeof r.repRef === "string" ? r.repRef.trim().slice(0, 40) : "";
    if (!ref && r.tenureMonths === "" && r.output === "") continue; // an empty row
    if (!ref) return NextResponse.json({ ok: false, error: "Give every rep an ID or initials." }, { status: 400 });
    const key = ref.toLowerCase();
    if (seen.has(key)) return NextResponse.json({ ok: false, error: `${ref} appears twice.` }, { status: 400 });
    seen.add(key);
    const tenure = Number(r.tenureMonths);
    if (r.tenureMonths === "" || r.tenureMonths == null || !Number.isFinite(tenure) || tenure < 0 || tenure > 600) return NextResponse.json({ ok: false, error: `Enter ${ref}'s tenure in months.` }, { status: 400 });
    const out = r.output === "" || r.output == null ? null : Number(r.output);
    if (out != null && (!Number.isFinite(out) || out < 0 || out > 1e12)) return NextResponse.json({ ok: false, error: `Check ${ref}'s output.` }, { status: 400 });
    rows.push({ member_id: me.member.id, rep_ref: ref, tenure_months: tenure, output: out, updated_at: new Date().toISOString() });
  }
  const refs = rows.map((r) => r.rep_ref as string);
  const { data: existing } = await db.from("lab_reps").select("rep_ref").eq("member_id", me.member.id);
  const drop = ((existing ?? []) as { rep_ref: string }[]).map((x) => x.rep_ref).filter((x) => !refs.includes(x));
  if (rows.length) {
    const { error } = await db.from("lab_reps").upsert(rows, { onConflict: "member_id,rep_ref" });
    if (error) return NextResponse.json({ ok: false, error: "Couldn't save. Please try again." }, { status: 500 });
  }
  if (drop.length) await db.from("lab_reps").delete().eq("member_id", me.member.id).in("rep_ref", drop);
  const unit = typeof b.unit === "string" ? b.unit.trim().slice(0, 30) : "";
  await db.from("lab_members").update({ profile: { ...me.member.profile, banding_unit: unit } }).eq("id", me.member.id);
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: "reps_saved" });
  return NextResponse.json({ ok: true });
}
