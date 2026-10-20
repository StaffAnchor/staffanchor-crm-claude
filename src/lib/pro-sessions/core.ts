import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Pro Sessions: paid 1:1 sessions for jobseekers, booked on the CRM's public /book/<service> page and linked from
// both websites. All times are Indian Standard Time (no daylight saving), so plain offsets are enough.

export const PRO_FROM = process.env.PRO_EMAIL_FROM || "info@staffanchor.com";
export const PRO_CC = process.env.PRO_EMAIL_CC || "gagan@staffanchor.com";
export const BOOKING_ORIGIN = "https://jobs.staffanchor.com";
export const HOLD_MINUTES = 15;

const IST_MS = 5.5 * 3600 * 1000;

export type ProService = {
  slug: string;
  title: string;
  tagline: string | null;
  description: string;
  duration_min: number;
  price_inr: number;
  popular: boolean;
};

export function adminDb(): SupabaseClient | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

/** "2026-10-21" for the Indian calendar day this instant falls on. */
export const istDate = (d: Date): string => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);

/** ISO weekday (1 = Monday ... 7 = Sunday) of an IST calendar date. */
export const isoWeekday = (dateStr: string): number => {
  const w = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
};

/** The instant that is `hhmm` on IST calendar day `dateStr`. */
export const fromIst = (dateStr: string, hhmm: string): Date => new Date(new Date(`${dateStr}T${hhmm.slice(0, 5)}:00Z`).getTime() - IST_MS);

export const addDays = (dateStr: string, n: number): string => new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

export function formatIst(d: Date): string {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export function cleanPhone(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (d.length === 10) return d;
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return null;
}
