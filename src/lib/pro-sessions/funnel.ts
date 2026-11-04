// Edge booking drop-offs: who tried to book or order, how far they got, and which attempts are just us testing.

// Names, emails and sources that mean an internal test: GS, Gagan, anything marked test, and our own addresses.
export function isTestPerson(name: string | null | undefined, email: string | null | undefined, source: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  const e = (email ?? "").trim().toLowerCase();
  const s = (source ?? "").trim().toLowerCase();
  return /(^|[^a-z])(gs|gagan|test|testing|demo)([^a-z]|$)/i.test(n) || /gagan|test|@staffanchor\.com$/.test(e) || /test/.test(s);
}

export type Stage = "paid" | "in_progress" | "dropped_payment" | "failed_start";

const IN_PROGRESS_MS = 30 * 60_000; // a held time is kept for 15 minutes; give a payment half an hour before calling it dropped

/** How far an attempt got. `paid` needs a payment; a recent unpaid attempt may still be in progress. */
export function stageOf(a: { paid: boolean; hasOrder: boolean; createdAt: string; failed?: boolean }, nowMs: number): Stage {
  if (a.paid) return "paid";
  if (!a.failed && nowMs - new Date(a.createdAt).getTime() < IN_PROGRESS_MS) return "in_progress";
  return a.hasOrder ? "dropped_payment" : "failed_start";
}

export const STAGE_TEXT: Record<Stage, string> = {
  paid: "Paid",
  in_progress: "Paying now",
  dropped_payment: "Opened payment, did not pay",
  failed_start: "Could not start payment",
};

export const pctText = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
