import type { ReactNode } from "react";

// Small pieces shared by the Pipeline and Matches split views, so both read the same.

/** Ring colour from the score band; a role-rank of 3 (not a fit) is always red. */
export const ringColor = (score: number | null, rank?: number) => (score == null ? "#cbd5e1" : rank === 3 || score < 45 ? "#e11d48" : score < 70 ? "#d97706" : "#059669");

/** The fit score as a ring that fills to the score. */
export function ScoreRing({ score, rank, size = 38 }: { score: number | null; rank?: number; size?: number }) {
  const color = ringColor(score, rank);
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: score == null ? "transparent" : `conic-gradient(${color} ${Math.max(4, Math.min(100, score)) * 3.6}deg, rgb(226 232 240 / 0.7) 0)`, border: score == null ? "1.5px dashed #cbd5e1" : undefined }}
    >
      <span className="flex items-center justify-center rounded-full bg-white font-semibold tabular-nums dark:bg-slate-900" style={{ width: size - 7, height: size - 7, fontSize: size > 40 ? 15 : 12, color: score == null ? "#94a3b8" : color }}>
        {score != null ? Math.min(100, Math.round(score)) : "?"}
      </span>
    </span>
  );
}

/** One labelled fact as a tile. */
export function FactTile({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
      <dt className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`mt-0.5 truncate text-[15px] font-semibold tabular-nums ${value ? "text-slate-900 dark:text-slate-100" : "text-slate-300"}`}>{value || "—"}</dd>
    </div>
  );
}

const NEXT_TONE = {
  go: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100",
  warn: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100",
  stop: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100",
  info: "border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-100",
};

/** The single next thing to do for this person, with the button that does it. */
export function NextStep({ tone, title, detail, children }: { tone: keyof typeof NEXT_TONE; title: string; detail?: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${NEXT_TONE[tone]}`}>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">Next step</p>
        <p className="text-[14px] font-semibold">{title}</p>
        {detail && <p className="mt-0.5 text-[12.5px] opacity-80">{detail}</p>}
      </div>
      {children && <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
