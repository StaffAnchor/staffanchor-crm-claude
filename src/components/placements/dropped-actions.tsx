"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import DropDialog, { type DropResult } from "./drop-dialog";

const btn = "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-semibold disabled:opacity-50";

// What an admin can do with one dropped placement: finish stopping the billing, tick off a refund, or undo.
export default function DroppedActions({ row }: { row: { linkId: string; candidate: string; client: string; joined: string | null; droppedOn: string | null; stage: string; recorded: boolean; needsDate: boolean; billingLive: boolean; refunds: { feeId: string }[] } }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);

  async function call(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action + (extra.feeId ?? ""));
    setMsg(null);
    try {
      const res = await fetch("/api/placements/drop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, linkId: row.linkId, ...extra }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) throw new Error(j.error ?? "That did not save.");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "That did not save.");
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(row.stage === "placed" || row.needsDate) && <button type="button" onClick={() => setDialog(true)} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>{row.needsDate ? "Set the date they left and cancel billing" : "Mark dropped and cancel billing"}</button>}
      {row.stage !== "placed" && !row.needsDate && row.billingLive && <button type="button" disabled={!!busy} onClick={() => void call("cancel_billing")} className={`${btn} bg-rose-600 text-white hover:bg-rose-700`}>{busy === "cancel_billing" ? "Cancelling…" : "Cancel billing"}</button>}
      {row.refunds.map((r) => (
        <button key={r.feeId} type="button" disabled={!!busy} onClick={() => void call("refund_settled", { feeId: r.feeId })} className={`${btn} bg-amber-600 text-white hover:bg-amber-700`}>{busy === "refund_settled" + r.feeId ? "Saving…" : "Refund paid back"}</button>
      ))}
      {row.recorded && <button type="button" disabled={!!busy} onClick={() => void call("undo")} className={`${btn} border border-slate-300 text-slate-600 hover:bg-slate-50`}>{busy === "undo" ? "Undoing…" : "Undo"}</button>}
      {msg && <span className="text-[13px] text-rose-700">{msg}</span>}
      {dialog && <DropDialog linkId={row.linkId} candidateName={row.candidate} clientName={row.client} joined={row.joined} defaultDate={row.droppedOn} onCancel={() => setDialog(false)} onDone={(_r: DropResult) => { setDialog(false); router.refresh(); }} />}
    </div>
  );
}
