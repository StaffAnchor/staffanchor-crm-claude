"use client";

import { useState } from "react";
import { X } from "lucide-react";

// Marking someone Placed needs the date they join: billing and the retention check-ins start from it.
export default function PlacedDateModal({ candidateName, initialDate = "", busy = false, onCancel, onConfirm }: { candidateName: string; initialDate?: string; busy?: boolean; onCancel: () => void; onConfirm: (date: string) => void }) {
  const [date, setDate] = useState(initialDate);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{candidateName} is joining</h3>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4">
          <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-200">
            Date of joining
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} autoFocus className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          <p className="text-[12px] text-slate-400">If it is not final yet, put the date they told you. You can change it later.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600">Cancel</button>
            <button type="button" disabled={!date || busy} onClick={() => onConfirm(date)} className="rounded-lg bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">Mark as placed</button>
          </div>
        </div>
      </div>
    </div>
  );
}
