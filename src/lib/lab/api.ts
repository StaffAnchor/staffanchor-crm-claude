import { NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";

// Shared by the manager-only /api/lab routes: the signed-in participant (a manager) and the database, or the reply to send.
export async function managerOnly() {
  const me = await currentLabMember();
  const db = adminDb();
  if (!me || me.member.role !== "manager") return { error: NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 }) };
  if (!db) return { error: NextResponse.json({ ok: false, error: "Not available right now." }, { status: 503 }) };
  return { me, db };
}
export const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) || null : null);
export const isoDate = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
export const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
export const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
