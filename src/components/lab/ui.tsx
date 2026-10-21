import type { ReactNode } from "react";
import type { Result } from "@/lib/lab/calc";

export function Bar({ pct, tone = "teal" }: { pct: number | null; tone?: "teal" | "amber" | "rose" | "slate" }) {
  const v = Math.max(0, Math.min(100, pct ?? 0));
  const color = { teal: "bg-teal-500", amber: "bg-amber-500", rose: "bg-rose-500", slate: "bg-slate-400" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
    </div>
  );
}

export const toneFor = (p: number): "teal" | "amber" | "rose" => (p >= 70 ? "teal" : p >= 40 ? "amber" : "rose");

export function Kpi({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

export function ResultPill({ r }: { r: Result | null }) {
  if (!r) return <span className="text-xs text-slate-400">Awaiting endline</span>;
  const cls = r === "Improved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : r === "Slipped" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${cls}`}>{r}</span>;
}

export function StatusChip({ progress, started }: { progress: number; started: boolean }) {
  if (!started) return <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Not started</span>;
  if (progress >= 70) return <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">On track</span>;
  if (progress >= 40) return <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">In progress</span>;
  return <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">Needs attention</span>;
}

export const signed = (n: number | null, unit = "") => (n == null ? "–" : `${n > 0 ? "+" : ""}${n}${unit}`);
