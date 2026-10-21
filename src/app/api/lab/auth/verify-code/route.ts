import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { LAB_COOKIE, LAB_MAX_AGE, hashCode, signSession } from "@/lib/lab/auth";

export const dynamic = "force-dynamic";

// Step 2: the code, checked against the newest unused one for that email (5 tries, 10 minutes), then a signed cookie.
export async function POST(req: NextRequest) {
  const { email, code } = (await req.json().catch(() => ({}))) as { email?: string; code?: string };
  const clean = (email ?? "").trim().toLowerCase();
  const digits = (code ?? "").replace(/\D/g, "");
  const bad = () => NextResponse.json({ ok: false, error: "That code isn't right or has expired. Request a new one." }, { status: 400 });
  if (!clean || digits.length !== 6) return bad();
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Sign-in isn't available right now." }, { status: 503 });

  const { data: member } = await db.from("lab_members").select("id, cohort_id").ilike("email", clean).eq("active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!member) return bad();
  const { data: row } = await db.from("lab_login_codes").select("id, code_hash, expires_at, attempts").eq("member_id", member.id).eq("used", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row || new Date(row.expires_at) < new Date() || row.attempts >= 5) return bad();
  if (row.code_hash !== hashCode(digits)) {
    await db.from("lab_login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return bad();
  }
  await db.from("lab_login_codes").update({ used: true }).eq("id", row.id);
  await db.from("lab_members").update({ last_login_at: new Date().toISOString() }).eq("id", member.id);
  await db.from("lab_audit").insert({ cohort_id: member.cohort_id, member_id: member.id, actor: clean, action: "login" });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(LAB_COOKIE, signSession(member.id), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: LAB_MAX_AGE });
  return res;
}
