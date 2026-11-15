import { phoneKey } from "@/lib/whatsapp-bot/engine";

// The rules a voice-agent call must pass before it is placed. They are checked when a campaign is made and again just
// before dialling, so a person who opts out or is called by someone else in between is never rung.

const IST_MS = 5.5 * 3600 * 1000;

export type CallWindow = { start: string; end: string; days: number[] };
/** Indian time, Monday to Saturday, 10am to 7pm. */
export const DEFAULT_WINDOW: CallWindow = { start: "10:00", end: "19:00", days: [1, 2, 3, 4, 5, 6] };
export const MAX_ATTEMPTS = 3;
/** No new call to the same person within this many days of the last attempt, from any campaign. */
export const COOLDOWN_DAYS = 7;
export const RECORDING_DAYS = 90;
/** A score from the role match at or above this counts as a strong match when no written fit read exists. */
export const STRONG_SCORE = 70;

/** Day of week (1 = Monday ... 7 = Sunday) and "HH:MM" in India at this instant. */
export function istParts(d: Date): { dow: number; hhmm: string } {
  const t = new Date(d.getTime() + IST_MS);
  const dow = t.getUTCDay() === 0 ? 7 : t.getUTCDay();
  return { dow, hhmm: t.toISOString().slice(11, 16) };
}

export function inWindow(now: Date, w: CallWindow = DEFAULT_WINDOW): boolean {
  const { dow, hhmm } = istParts(now);
  return w.days.includes(dow) && hhmm >= w.start.slice(0, 5) && hhmm < w.end.slice(0, 5);
}

export type EligibilityInput = {
  phone: string | null;
  phoneHold: boolean | null;
  voiceOptOutAt: string | null;
  stage: string;
  inShortlist: boolean;
  applied: boolean;
  score: number | null;
  recommendation: string | null;
  interest: string | null;
  lastAttemptAt: string | null;
  now: Date;
};

/** Why this person should not be called for this role, or null when they can be. */
export function skipReason(i: EligibilityInput): string | null {
  const key = phoneKey(i.phone);
  if (!key || key.length !== 10) return "No usable phone number";
  if (i.phoneHold) return "Phone number on hold";
  if (i.voiceOptOutAt) return "Asked not to be called";
  if (["rejected", "pulled_back", "placed"].includes(i.stage)) return "Already out of this role";
  if (i.inShortlist) return "Already with the client";
  if (!i.applied) return "Did not apply, so no consent to call";
  if (i.interest === "not_interested") return "Said no to this role";
  const strong = i.recommendation === "Strong Fit" || (i.recommendation == null && i.score != null && i.score >= STRONG_SCORE);
  if (!strong) return "Not a strong match";
  if (i.lastAttemptAt && i.now.getTime() - new Date(i.lastAttemptAt).getTime() < COOLDOWN_DAYS * 86_400_000) return `Called in the last ${COOLDOWN_DAYS} days`;
  return null;
}
