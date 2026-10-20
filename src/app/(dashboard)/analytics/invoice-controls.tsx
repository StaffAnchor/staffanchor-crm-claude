"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type InvoiceInfo = { id: string; number: string; url: string | null; sentAt: string | null; sentTo: string | null; email: string | null };

const BTN = "rounded-md border border-slate-300 px-2 py-1 text-[12px] text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800";

// The tax invoice for one paid booking or order. It is made automatically at payment; it is emailed only when asked.
export default function InvoiceControls({ kind, refId, invoice }: { kind: "edge" | "resume"; refId: string; invoice: InvoiceInfo | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function make() {
    setBusy(true);
    setMsg(null);
    const r = await fetch("/api/admin/service-invoices/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, refId }) });
    setBusy(false);
    if (!r.ok) setMsg("Couldn't make the invoice.");
    router.refresh();
  }
  async function send() {
    if (!invoice) return;
    const to = window.prompt("Send the invoice to:", invoice.email ?? "");
    if (!to) return;
    setBusy(true);
    setMsg(null);
    const r = await fetch(`/api/admin/service-invoices/${invoice.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to }) });
    const j = await r.json().catch(() => ({ ok: false, error: "Send failed" }));
    setBusy(false);
    setMsg(j.ok ? `Sent to ${j.sentTo}.` : j.error ?? "Send failed");
    router.refresh();
  }

  if (!invoice) {
    return (
      <div className="flex items-center gap-2 text-[12px]">
        <span className="text-amber-700 dark:text-amber-300">No invoice yet.</span>
        <button className={BTN} disabled={busy} onClick={make}>Make invoice</button>
        {msg && <span className="text-slate-500">{msg}</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px]">
      <span className="font-medium text-slate-700 dark:text-slate-200">Invoice {invoice.number}</span>
      {invoice.url && <a className="text-teal-600 hover:underline" href={invoice.url} target="_blank">Download</a>}
      <button className={BTN} disabled={busy} onClick={send}>{invoice.sentAt ? "Send again" : "Send to customer"}</button>
      <span className="text-slate-400">{invoice.sentAt ? `Sent to ${invoice.sentTo} on ${new Date(invoice.sentAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" })}` : "Not sent"}</span>
      {msg && <span className="text-slate-500">{msg}</span>}
    </div>
  );
}
