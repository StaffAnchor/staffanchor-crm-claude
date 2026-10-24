"use client";

import { useState } from "react";

// Shows text that is meant to be copied (the link, the message to send) with one button.
export default function CopyBox({ label, value, rows }: { label: string; value: string; rows?: number }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      /* the text is selectable, so it can still be copied by hand */
    }
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <button onClick={copy} className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-teal-700">{done ? "Copied" : "Copy"}</button>
      </div>
      {rows ? (
        <textarea readOnly rows={rows} value={value} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
      ) : (
        <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900" />
      )}
    </div>
  );
}
