"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DropDialog from "./drop-dialog";

const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const btn = "inline-flex h-7 items-center rounded-lg px-2.5 text-[12px] font-semibold disabled:opacity-50";
const field = "h-7 rounded-lg border border-slate-300 bg-white px-2 text-[12px] dark:border-slate-600 dark:bg-slate-900";

type Mode = null | "billed" | "received" | "cancel" | "unbill" | "undo" | "restore";

const OPTIONS: Record<string, { mode: Exclude<Mode, null>; label: string }[]> = {
  potential: [{ mode: "billed", label: "Mark billed" }, { mode: "received", label: "Mark received" }, { mode: "cancel", label: "Cancel this fee" }],
  billed: [{ mode: "received", label: "Mark received" }, { mode: "unbill", label: "Move back to potential" }, { mode: "cancel", label: "Cancel this fee" }],
  received: [{ mode: "undo", label: "Undo received" }, { mode: "cancel", label: "Cancel this fee (refund due)" }],
  cancelled: [{ mode: "restore", label: "Restore this fee" }],
};

// Change one fee's stage from the Placements page. Everything here writes to the same fee record Billing and Analytics read.
export default function FeeRowActions({ feeId, cls, linkId, candidate, client, joinedOn, cancelKind }: { feeId: string; cls: string; linkId: string; candidate: string; client: string; joinedOn: string | null; cancelKind?: "left" | "other" | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [date, setDate] = useState(today());
  const [invoice, setInvoice] = useState("");
  const [reason, setReason] = useState("client");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);

  const stage = cls === "refund_due" || cls === "refunded" ? "cancelled" : cls;
  const options = OPTIONS[stage] ?? [];
  if (options.length === 0) return null;
  if (stage === "cancelled" && cancelKind === "left") return <span className="text-[11px] text-slate-400">Undo the drop on the placement</span>;

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/placements/fee", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, feeId, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "That did not save.");
      setMode(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(false);
  }

  const run = () => {
    if (mode === "billed") return call("mark_billed", { date, invoiceNumber: invoice });
    if (mode === "received") return call("mark_received", { date });
    if (mode === "unbill") return call("unbill");
    if (mode === "undo") return call("undo_received");
    if (mode === "restore") return call("restore_fee");
    if (mode === "cancel") {
      if (reason === "left") return setDrop(true);
      return call("cancel_fee", { reason, note });
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <select value={mode ?? ""} onChange={(e) => { setMode((e.target.value || null) as Mode); setErr(null); }} aria-label="Change this fee's status" className={`${field} font-medium text-slate-700 dark:text-slate-200`}>
        <option value="">Change status…</option>
        {options.map((o) => <option key={o.mode} value={o.mode}>{o.label}</option>)}
      </select>
      {mode && (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {(mode === "billed" || mode === "received") && <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} aria-label={mode === "billed" ? "Day the invoice went out" : "Day the money came in"} className={field} />}
          {mode === "billed" && <input value={invoice} onChange={(e) => setInvoice(e.target.value)} placeholder="Invoice no. (optional)" maxLength={60} className={`${field} w-36`} />}
          {mode === "cancel" && (
            <>
              <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Why" className={field}>
                <option value="left">The candidate left (within 90 days)</option>
                <option value="client">Cancelled by the client</option>
                <option value="duplicate">Duplicate or entered by mistake</option>
                <option value="other">Other</option>
              </select>
              {reason !== "left" && <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={reason === "other" ? "Reason" : "Note (optional)"} maxLength={200} className={`${field} w-40`} />}
            </>
          )}
          {(mode === "unbill" || mode === "undo" || mode === "restore") && <span className="text-[12px] text-slate-500">{mode === "unbill" ? "Back to potential?" : mode === "undo" ? "Take the payment back?" : "Bring this fee back?"}</span>}
          <button type="button" disabled={busy || ((mode === "billed" || mode === "received") && !date) || (mode === "cancel" && reason === "other" && !note.trim())} onClick={() => void run()} className={`${btn} ${mode === "cancel" ? "bg-rose-600 text-white hover:bg-rose-700" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}>{busy ? "Saving…" : mode === "cancel" && reason === "left" ? "Continue" : "Confirm"}</button>
          <button type="button" disabled={busy} onClick={() => { setMode(null); setErr(null); }} className={`${btn} border border-slate-300 text-slate-600`}>Cancel</button>
        </span>
      )}
      {err && <span className="max-w-[300px] text-right text-[11px] text-rose-700">{err}</span>}
      {drop && <DropDialog linkId={linkId} candidateName={candidate} clientName={client} joined={joinedOn} onCancel={() => setDrop(false)} onDone={() => { setDrop(false); setMode(null); router.refresh(); }} />}
    </span>
  );
}
