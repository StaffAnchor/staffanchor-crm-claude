import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { SCORECARD_DEFAULT } from "@/lib/lab/calc";

export const dynamic = "force-dynamic";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from(crypto.randomBytes(6), (b) => ALPHABET[b % ALPHABET.length]).join("");

// Calibration: two managers score the same call, then compare. Everything goes through here so the rules hold:
// only the two paired managers can touch a calibration, and the partner's ratings stay hidden until both have scored.
export async function POST(req: NextRequest) {
  const me = await currentLabMember();
  if (!me || me.member.role !== "manager") return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fail = (m: string, status = 400) => NextResponse.json({ ok: false, error: m }, { status });
  const mine = (c: { a_member: string; b_member: string | null }) => c.a_member === me.member.id || c.b_member === me.member.id;

  if (b.action === "create") {
    const callRef = typeof b.callRef === "string" ? b.callRef.trim().slice(0, 60) : "";
    for (let i = 0; i < 5; i++) {
      const code = newCode();
      const { data, error } = await db.from("lab_calibrations").insert({ cohort_id: me.cohort.id, code, call_ref: callRef || null, a_member: me.member.id }).select("id").single();
      if (!error && data) return NextResponse.json({ ok: true, id: data.id, code });
    }
    return fail("Couldn't start a calibration. Please try again.", 500);
  }

  if (b.action === "join") {
    const code = typeof b.code === "string" ? b.code.trim().toUpperCase() : "";
    const { data: c } = await db.from("lab_calibrations").select("id, cohort_id, a_member, b_member").eq("code", code).maybeSingle();
    // Same message for a wrong code and a code from another company, so codes can't be probed.
    if (!c || c.cohort_id !== me.cohort.id) return fail("That code doesn't match a calibration. Check it with your partner.");
    if (c.a_member === me.member.id) return fail("That's the code you created. Share it with your partner instead.");
    if (c.b_member && c.b_member !== me.member.id) return fail("Someone has already joined that calibration.");
    await db.from("lab_calibrations").update({ b_member: me.member.id }).eq("id", c.id);
    return NextResponse.json({ ok: true, id: c.id });
  }

  const { data: cal } = await db.from("lab_calibrations").select("id, a_member, b_member, standards").eq("id", String(b.id ?? "")).maybeSingle();
  if (!cal || !mine(cal)) return fail("Calibration not found.", 404);
  const { data: scores } = await db.from("lab_calibration_scores").select("member_id").eq("calibration_id", cal.id);
  const submitted = new Set(((scores ?? []) as { member_id: string }[]).map((x) => x.member_id));
  const both = !!cal.b_member && submitted.has(cal.a_member) && submitted.has(cal.b_member);

  if (b.action === "submit") {
    if (!cal.b_member) return fail("Wait for your partner to join with the code first.");
    if (both) return fail("Both of you have scored this call, so the ratings are locked.");
    const ratings: Record<string, number> = {};
    const raw = (b.ratings ?? {}) as Record<string, unknown>;
    for (const c of SCORECARD_DEFAULT) {
      const r = Number(raw[c.key]);
      if (!Number.isInteger(r) || r < 1 || r > 5) return fail(`Rate ${c.label} from 1 to 5.`);
      ratings[c.key] = r;
    }
    await db.from("lab_calibration_scores").upsert({ calibration_id: cal.id, member_id: me.member.id, ratings, submitted_at: new Date().toISOString() }, { onConflict: "calibration_id,member_id" });
    return NextResponse.json({ ok: true });
  }

  if (b.action === "standards") {
    if (!both) return fail("You can agree the standards once both of you have scored the call.");
    const raw = (b.standards ?? {}) as Record<string, unknown>;
    const standards: Record<string, string> = {};
    for (const c of SCORECARD_DEFAULT) standards[c.key] = typeof raw[c.key] === "string" ? (raw[c.key] as string).trim().slice(0, 300) : "";
    await db.from("lab_calibrations").update({ standards }).eq("id", cal.id);
    return NextResponse.json({ ok: true });
  }
  return fail("Unknown action.");
}
