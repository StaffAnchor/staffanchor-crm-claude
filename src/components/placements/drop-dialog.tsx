"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { GUARANTEE_DAYS, daysBetween } from "@/lib/placements/drops";

const REASONS = ["Left on their own", "The client let them go", "Performance", "Never joined", "Other"];
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

export type DropResult = { cancelled: number; refundDue: number; emailed: string[] };

// Recording that a placed person left inside the 90-day guarantee. Billing for the placement is cancelled with it.
export default function DropDialog({ linkId, candidateName, clientName, joined, defaultDate, onCancel, onDone }: { linkId: string; candidateName: string; clientName: string; joined: string | null; defaultDate?: string | null; onCancel: () => void; onDone: (r: DropResult) => void }) {
  const [date, setDate] = useState(defaultDate && defaultDate <= today() ? defaultDate : today());
  const [reason, setReason] = useState(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = joined ? daysBetween(joined, date) : null;
  const tooLate = days !== null && days > GUARANTEE_DAYS;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/placements/drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "drop", linkId, droppedOn: date, reason, note }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "That did not save. Try again.");
      onDone({ cancelled: j.cancelled ?? 0, refundDue: j.refundDue ?? 0, emailed: j.emailed ?? [] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not save.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4" onClick={busy ? undefined : onCancel}>
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Mark as dropped">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{candidateName} dropped</h3>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close" className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 p-4 text-[14px] text-slate-700 dark:text-slate-200">
          <label className="block font-medium">
            Date they left
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] dark:border-slate-700 dark:bg-slate-900" />
          </label>
          {days !== null && <p className={`text-[13px] ${tooLate ? "font-medium text-rose-700" : "text-slate-500"}`}>{days < 0 ? "Before the joining date." : `${days} days after joining.`} {tooLate ? `That is past the ${GUARANTEE_DAYS}-day guarantee, so the fee stays.` : `Inside the ${GUARANTEE_DAYS}-day guarantee.`}</p>}
          <label className="block font-medium">
            Why
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[15px] dark:border-slate-700 dark:bg-slate-900">{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="A short note (optional)" className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[14px] dark:border-slate-700 dark:bg-slate-900" />
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-500 dark:text-slate-400">
            <li>The fee for {clientName} is cancelled. Unpaid invoices are simply cancelled.</li>
            <li>If the client already paid, it is flagged <b>refund due</b>. No money moves from here: you refund by hand and tick it off afterwards.</li>
            <li>The person leaves the Placed list and moves to Dropped. You can undo this.</li>
          </ul>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg border border-slate-200 px-3 py-1.5 text-[14px] text-slate-600">Cancel</button>
            <button type="button" onClick={() => void go()} disabled={busy || tooLate} className="rounded-lg bg-rose-600 px-4 py-1.5 text-[14px] font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{busy ? "Saving…" : "Mark dropped and cancel billing"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
