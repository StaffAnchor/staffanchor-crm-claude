import { NextRequest, NextResponse } from "next/server";
import { adminDb, cleanPhone } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";

export const dynamic = "force-dynamic";

const FIELDS = ["designation", "function", "team_size", "years_experience", "city", "phone"] as const;
const REQUIRED = ["designation", "team_size", "years_experience"] as const;

// A participant's own details: name, designation, team size, experience, city, phone. Nobody else can edit them here.
export async function PUT(req: NextRequest) {
  const me = await currentLabMember();
  if (!me) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max = 120) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const profile: Record<string, string> = { ...me.member.profile };
  for (const f of FIELDS) {
    const v = str(f, 60);
    if (f === "phone") profile.phone = v ? cleanPhone(v) ?? "" : "";
    else if (f === "team_size" || f === "years_experience") profile[f] = /^\d{1,3}$/.test(v) ? v : "";
    else profile[f] = v;
  }
  const fullName = str("full_name") || me.member.full_name || "";
  const done = fullName.length > 1 && REQUIRED.every((k) => !!profile[k]);
  await db.from("lab_members").update({ full_name: fullName || null, profile, profile_done_at: done ? me.member.profile_done_at ?? new Date().toISOString() : null }).eq("id", me.member.id);
  await db.from("lab_audit").insert({ cohort_id: me.cohort.id, member_id: me.member.id, actor: me.member.email, action: "profile_saved" });
  return NextResponse.json({ ok: true, done });
}
