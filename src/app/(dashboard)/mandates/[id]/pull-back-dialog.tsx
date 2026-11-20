"use client";

import { useState } from "react";
import { Undo2, X } from "lucide-react";

// Asks once before a person is taken off the client's screen. The wording changes when the client has already reacted.
export default function PullBackDialog({ candidateName, clientName, clientReacted, onCancel, onConfirm }: { candidateName: string; clientName: string; clientReacted: boolean; onCancel: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={busy ? undefined : onCancel}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Pull back from the client">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100"><Undo2 className="h-4 w-4 text-amber-600" /> Pull {candidateName} back?</h3>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4 text-[14px] text-slate-700 dark:text-slate-200">
          <p>{candidateName} will disappear from {clientName}&apos;s portal and shortlist link straight away. They will not see a &ldquo;withdrawn&rdquo; label either.</p>
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-500 dark:text-slate-400">
            <li>If {clientName} was already emailed about this person, that email cannot be unsent. The link in it will simply no longer show them.</li>
            {clientReacted && <li className="font-medium text-amber-700 dark:text-amber-300">{clientName} has already reacted to this person. That reaction stays in the history.</li>}
            <li>You can share them again later from Matches or the Pipeline.</li>
          </ul>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] text-slate-600">Keep them shared</button>
            <button type="button" onClick={() => void go()} disabled={busy} className="rounded-lg bg-amber-600 px-4 py-1.5 text-[14px] font-semibold text-white hover:bg-amber-700 disabled:opacity-50">{busy ? "Pulling back…" : "Pull back"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
