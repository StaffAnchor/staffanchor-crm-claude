"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const btn = "inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] font-semibold disabled:opacity-50";

// What an admin does with one fee line: mark it received (with the day), take that back, or go raise the invoice.
export default function FeeRowActions({ feeId, cls }: { feeId: string; cls: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/placements/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, feeId, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "That did not save.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  }

  if (cls === "not_invoiced")
    return <a href="/analytics/billing" target="_blank" rel="noopener noreferrer" className={`${btn} border border-slate-300 text-slate-700 hover:bg-slate-50`}>Raise invoice ↗</a>;
  if (cls === "received")
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <button type="button" disabled={busy} onClick={() => void call("undo_received")} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}>{busy ? "Undoing…" : "Undo"}</button>
        {err && <span className="text-[11px] text-rose-700">{err}</span>}
      </span>
    );
  if (cls !== "waiting") return null;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>Mark received</button>
      ) : (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label="Day the money came in" className="h-7 rounded-lg border border-slate-300 bg-white px-2 text-[12px] dark:border-slate-600 dark:bg-slate-900" />
          <button type="button" disabled={busy || !date} onClick={() => void call("mark_received", { receivedOn: date })} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>{busy ? "Saving…" : "Save"}</button>
          <button type="button" disabled={busy} onClick={() => { setOpen(false); setErr(null); }} className={`${btn} border border-slate-300 text-slate-600`}>Cancel</button>
        </span>
      )}
      {err && <span className="max-w-[260px] text-right text-[11px] text-rose-700">{err}</span>}
    </span>
  );
}
