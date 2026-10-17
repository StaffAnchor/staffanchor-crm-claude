"use client";

import { RATING_DIMENSIONS, RATING_LABEL, type CallRating, type RatingKey, type RatingValue } from "@/lib/call-ratings";

const TONE: Record<RatingValue, string> = {
  good: "border-emerald-600 bg-emerald-600 text-white",
  okay: "border-amber-500 bg-amber-500 text-white",
  weak: "border-rose-600 bg-rose-600 text-white",
};

// Optional: five one-tap ratings for how the call went. Tapping a chosen chip
// again clears it, and nothing is required.
export function CallRatingTags({ value, onChange }: { value: CallRating; onChange: (v: CallRating) => void }) {
  function set(key: RatingKey, v: RatingValue) {
    onChange({ ...value, [key]: value[key] === v ? null : v });
  }
  return (
    <div className="space-y-2">
      {RATING_DIMENSIONS.map((d) => (
        <div key={d.key} className="flex flex-wrap items-center gap-2">
          <span className="w-32 text-[12.5px] text-slate-600 dark:text-slate-300">{d.label}</span>
          <div className="flex gap-1.5">
            {(["good", "okay", "weak"] as RatingValue[]).map((v) => {
              const on = value[d.key] === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(d.key, v)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
                    on ? TONE[v] : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {RATING_LABEL[v]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export type RatingRow = CallRating & { id: string; created_at: string; rater_name: string | null };

const DOT: Record<RatingValue, string> = { good: "bg-emerald-500", okay: "bg-amber-500", weak: "bg-rose-500" };

export function CallRatingHistory({ rows }: { rows: RatingRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Earlier call ratings</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.id} className="text-[12px] text-slate-600 dark:text-slate-300">
            <span className="text-slate-400">
              {new Date(r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}
              {r.rater_name ? ` · ${r.rater_name}` : ""}
            </span>
            <span className="ml-2 inline-flex flex-wrap gap-x-3 gap-y-1">
              {RATING_DIMENSIONS.filter((d) => r[d.key]).map((d) => (
                <span key={d.key} className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${DOT[r[d.key] as RatingValue]}`} />
                  {d.label}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
