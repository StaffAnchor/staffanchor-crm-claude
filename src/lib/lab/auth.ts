import crypto from "crypto";
import { cookies } from "next/headers";
import { adminDb } from "@/lib/pro-sessions/core";

// Sales Leaders Lab sign-in: an emailed 6-digit code, then a signed cookie. Same idea as the shortlist link and
// the same secret, namespaced, so there is nothing new to configure.
const SECRET = `lab-auth:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`;
export const LAB_COOKIE = "lab_session";
export const LAB_MAX_AGE = 60 * 60 * 24 * 30;

export const hashCode = (code: string) => crypto.createHmac("sha256", SECRET).update(code).digest("hex");
export const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

export function signSession(memberId: string): string {
  const payload = `${memberId}:${Date.now() + LAB_MAX_AGE * 1000}`;
  return `${Buffer.from(payload).toString("base64url")}.${crypto.createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

export function verifySession(value: string | undefined): string | null {
  if (!value) return null;
  const [b64, mac] = value.split(".");
  if (!b64 || !mac) return null;
  const payload = Buffer.from(b64, "base64url").toString();
  const expect = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
  if (mac.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  const [id, exp] = payload.split(":");
  return Number(exp) > Date.now() ? id : null;
}

export type LabRole = "manager" | "sales_head" | "management" | "facilitator";
export type LabMember = {
  id: string; cohort_id: string; email: string; full_name: string | null; role: LabRole; reports_to: string | null;
  profile: Record<string, string>; profile_done_at: string | null; active: boolean;
};
export type LabCohort = { id: string; company_name: string; name: string; start_date: string | null; status: string; config: Record<string, unknown> };

/** Leaders see the whole cohort; managers see themselves, plus anonymous cohort averages. */
export const isLeader = (role: LabRole) => role !== "manager";

export async function currentLabMember(): Promise<{ member: LabMember; cohort: LabCohort } | null> {
  const id = verifySession((await cookies()).get(LAB_COOKIE)?.value);
  if (!id) return null;
  const db = adminDb();
  if (!db) return null;
  const { data: member } = await db.from("lab_members").select("id, cohort_id, email, full_name, role, reports_to, profile, profile_done_at, active").eq("id", id).maybeSingle();
  if (!member || !member.active) return null;
  const { data: cohort } = await db.from("lab_cohorts").select("id, company_name, name, start_date, status, config").eq("id", member.cohort_id).maybeSingle();
  return cohort ? { member: member as LabMember, cohort: cohort as LabCohort } : null;
}
