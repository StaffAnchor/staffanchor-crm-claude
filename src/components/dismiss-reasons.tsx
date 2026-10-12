"use client";

import { DISMISS_REASON_CHIPS } from "@/lib/ai-feedback";

// Optional one-tap reasons shown when a suggestion is turned down. Nothing has
// to be picked: "Dismiss" works with no chips selected.
export default function DismissReasons({
  value,
  onChange,
  onConfirm,
  busy,
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  function toggle(code: string) {
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);
  }
  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11.5px] text-slate-500 dark:text-slate-400">Why not? Optional. It helps the AI get better.</p>
      <div className="flex flex-wrap gap-1.5">
        {DISMISS_REASON_CHIPS.map((r) => {
          const on = value.includes(r.code);
          return (
            <button
              key={r.code}
              type="button"
              onClick={() => toggle(r.code)}
              aria-pressed={on}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                on
                  ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-[12.5px] font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {busy ? "Saving..." : value.length ? "Dismiss" : "Dismiss without a reason"}
        </button>
        <span className="text-[11.5px] text-slate-500">They stay in the bank for other roles.</span>
      </div>
    </div>
  );
}
