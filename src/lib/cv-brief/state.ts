// Where a candidate's CV form stands, in words, and whether it is time for a nudge. Pure, so pages and lists share it.

export type StateInput = {
  status: "sent" | "started" | "submitted";
  opened_at: string | null;
  created_at: string;
  last_reminded_at: string | null;
};

export type BriefState = { key: "submitted" | "started" | "opened" | "sent"; label: string; cls: string; nudge: boolean };

const DAY = 24 * 60 * 60 * 1000;
export const NUDGE_AFTER_DAYS = 2;

export function briefState(b: StateInput, nowMs: number): BriefState {
  if (b.status === "submitted") return { key: "submitted", label: "Submitted", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", nudge: false };
  // Time since anyone last chased them: the last reminder if there was one, otherwise when the link was made.
  const since = nowMs - new Date(b.last_reminded_at ?? b.created_at).getTime();
  const nudge = since >= NUDGE_AFTER_DAYS * DAY;
  if (b.status === "started") return { key: "started", label: "In progress", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", nudge };
  if (b.opened_at) return { key: "opened", label: "Opened, not started", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", nudge };
  return { key: "sent", label: "Link made, not opened", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", nudge };
}

export function ago(iso: string, nowMs: number): string {
  const mins = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
