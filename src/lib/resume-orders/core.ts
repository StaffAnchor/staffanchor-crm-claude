import crypto from "crypto";

// Resume Writing orders: bought on jobs.staffanchor.com, recorded here. Prices live here, so the browser can never set one.

export type TierKey = "early" | "mid" | "senior";

export const TIERS: Record<TierKey, { label: string; band: string; price: number; revisions: number; finalDelivery: string }> = {
  early: { label: "Early Stage Resume Writing", band: "0-5 years", price: 2000, revisions: 1, finalDelivery: "about 5 working days" },
  mid: { label: "Mid Level Resume Writing", band: "6-12 years", price: 3000, revisions: 1, finalDelivery: "about 5 working days" },
  senior: { label: "Senior / CXO Resume Writing", band: "13+ years", price: 4000, revisions: 2, finalDelivery: "about 7 working days" },
};

/** The plan, and so the price, depends on years of experience only: 0-5, 6-12, 13 and above. */
export const tierForYears = (years: number): TierKey => (years <= 5 ? "early" : years <= 12 ? "mid" : "senior");

// Interview Preparation + Job Strategy: one 1:1 session with Gagan, 60 or 90 minutes, priced by experience band and length.
export type SessionMinutes = 60 | 90;
export const SESSION_PRICE: Record<TierKey, Record<SessionMinutes, number>> = {
  early: { 60: 2000, 90: 3000 },
  mid: { 60: 3000, 90: 4500 },
  senior: { 60: 5000, 90: 7500 },
};
export const asSessionMinutes = (m: number): SessionMinutes => (m === 90 ? 90 : 60);

export function sessionPrice(years: number, minutes: number) {
  const tier = tierForYears(years);
  return { tier, minutes: asSessionMinutes(minutes), price: SESSION_PRICE[tier][asSessionMinutes(minutes)] };
}

// Interview Preparation + Job Strategy + Resume Rebuild: the session (60 or 90 minutes) plus Resume Writing for the band, less 20%.
export const COMBO_DISCOUNT_PCT = 20;

export function comboPrice(years: number, minutes: number = 60) {
  const tier = tierForYears(years);
  const session = SESSION_PRICE[tier][asSessionMinutes(minutes)];
  const resume = TIERS[tier].price;
  const subtotal = session + resume;
  const total = Math.round((subtotal * (100 - COMBO_DISCOUNT_PCT)) / 100);
  return { tier, session, resume, subtotal, discount: subtotal - total, total };
}

export const isTier = (t: unknown): t is TierKey => t === "early" || t === "mid" || t === "senior";

export const newToken = () => crypto.randomBytes(18).toString("base64url");

const IST_MS = 5.5 * 3600 * 1000;

/** The instant `n` working days (Monday to Saturday) after `from`, at the same India clock time. */
export function addWorkingDays(from: Date, n: number): Date {
  let d = new Date(from.getTime());
  let left = n;
  while (left > 0) {
    d = new Date(d.getTime() + 86400000);
    const dow = new Date(d.getTime() + IST_MS).getUTCDay(); // 0 = Sunday
    if (dow !== 0) left--;
  }
  return d;
}

export const FIRST_DRAFT_DAYS = 3;

export const dateIn = (d: Date) => d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "2-digit", month: "short", year: "numeric" });
