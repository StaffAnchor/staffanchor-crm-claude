"use client";

import { useState } from "react";
import { X, UserX, Building2, Loader2 } from "lucide-react";
import { RECRUITER_REJECTION_REASONS, CLIENT_REJECTION_REASONS, type StageSource } from "@/lib/mandate-stage";

// Replaces the old single "Rejected" dropdown option + easy-to-miss "Client
// told us this" checkbox + optional free-text box. That combination is
// exactly what produced the confusion the user flagged: candidates the
// recruiter themselves passed on were showing up looking like client
// rejections (or vice versa) because attribution was one unchecked
// checkbox away from being wrong, and a reason was never required at all.
// This modal makes the two flows physically distinct buttons up front, and
// won't let a rejection through without a category picked from the list
// that's actually true for whoever made the call.
export default function MandateRejectModal({
  candidateName,
  onCancel,
  onConfirm,
  submitting = false,
}: {
  candidateName: string;
  onCancel: () => void;
  onConfirm: (result: { source: Extract<StageSource, "recruiter" | "client_relayed">; category: string; note: string }) => void;
  submitting?: boolean;
}) {
  const [source, setSource] = useState<"recruiter" | "client_relayed" | null>(null);
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");

  const reasons = source === "recruiter" ? RECRUITER_REJECTION_REASONS : CLIENT_REJECTION_REASONS;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            Reject {candidateName}
          </h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!source ? (
          <div className="p-4 space-y-2">
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-2">
              Who&apos;s making this call? This decides which reason list you&apos;ll pick from, and how it&apos;s reported.
            </p>
            <button
              onClick={() => setSource("recruiter")}
              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 text-left hover:border-indigo-300 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20 transition-colors"
            >
              <UserX className="w-5 h-5 text-indigo-500 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">We&apos;re passing</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">Our own call -- never reached the client</span>
              </span>
            </button>
            <button
              onClick={() => setSource("client_relayed")}
              className="w-full flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 py-3 text-left hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 transition-colors"
            >
              <Building2 className="w-5 h-5 text-amber-500 shrink-0" />
              <span>
                <span className="block text-[13px] font-semibold text-slate-800 dark:text-slate-100">Client passed</span>
                <span className="block text-[11.5px] text-slate-500 dark:text-slate-400">Client (or their portal) made this call</span>
              </span>
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <button onClick={() => setSource(null)} className="text-[11px] text-slate-400 hover:text-slate-600">
              ← Change who&apos;s rejecting
            </button>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Reason <span className="text-rose-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                autoFocus
                className="w-full text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white dark:bg-slate-900"
              >
                <option value="">Select a reason…</option>
                {reasons.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Additional detail (optional)
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Anything specific worth remembering..."
                className="w-full text-[13px] rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-2 bg-white dark:bg-slate-900 resize-none"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={onCancel} className="text-[12.5px] font-medium text-slate-500 hover:text-slate-700 px-3 py-1.5">
                Cancel
              </button>
              <button
                onClick={() => onConfirm({ source, category, note })}
                disabled={!category || submitting}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3.5 py-1.5"
              >
                {submitting && <Loader2 className="w-3 h-3 animate-spin" />}
                Confirm reject
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
