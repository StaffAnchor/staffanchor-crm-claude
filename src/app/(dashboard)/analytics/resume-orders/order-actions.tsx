"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BTN = "rounded-md border border-slate-300 px-2 py-1 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

export default function OrderActions({ id, status, revisionsUsed, revisionsAllowed }: { id: string; status: string; revisionsUsed: number; revisionsAllowed: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function act(action: string) {
    setBusy(true);
    await fetch(`/api/admin/resume-orders/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    setBusy(false);
    router.refresh();
  }

  if (status === "pending_payment" || status === "failed") return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {(status === "paid" || status === "details_received" || status === "revision") && (
        <button className={BTN} disabled={busy} onClick={() => act("draft_sent")}>{status === "revision" ? "Revised draft sent" : "Draft sent"}</button>
      )}
      {status === "draft_sent" && (
        <button className={BTN} disabled={busy} onClick={() => act("revision")}>Revision asked ({revisionsUsed}/{revisionsAllowed} used)</button>
      )}
      {status !== "completed" && status !== "paid" && (
        <button className={BTN} disabled={busy} onClick={() => act("completed")}>Completed</button>
      )}
      {status === "completed" && (
        <button className={BTN} disabled={busy} onClick={() => act("reopen")}>Reopen</button>
      )}
    </div>
  );
}
