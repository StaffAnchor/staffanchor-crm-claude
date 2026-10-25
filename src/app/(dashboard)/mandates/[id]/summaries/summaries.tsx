"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Brief } from "@/lib/candidate-brief";

export type SummaryRow = { id: string; name: string; line: string; brief: Brief | null; approvedAt: string | null; changed: boolean };

export default function Summaries({ mandateId, rows }: { mandateId: string; rows: SummaryRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const missing = rows.filter((r) => !r.brief).length;
  const toApprove = rows.filter((r) => r.brief && (!r.approvedAt || r.changed));

  async function writeMissing() {
    setBusy("write");
    setMessage(null);
    try {
      let total = 0;
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`/api/mandates/${mandateId}/summaries`, { method: "POST" });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.ok) {
          setMessage(d.error ?? "Couldn't write the summaries.");
          break;
        }
        total += d.written ?? 0;
        setMessage(`${total} written so far…`);
        if ((d.written ?? 0) === 0 || (d.remaining ?? 0) === 0) {
          if (d.error) setMessage(`${total} written. ${d.error}`);
          else setMessage(`${total} written.`);
          break;
        }
      }
    } finally {
      setBusy(null);
      router.refresh();
    }
  }

  async function approve(id: string, yes: boolean) {
    setBusy(id);
    setMessage(null);
    const { data, error } = await createClient().rpc("approve_candidate_brief", { p_candidate: id, p_approve: yes });
    const d = data as { ok?: boolean; error?: string } | null;
    if (error || !d?.ok) setMessage(d?.error ?? error?.message ?? "Couldn't save the approval.");
    setBusy(null);
    router.refresh();
  }

  async function approveAll() {
    for (const r of toApprove) await approve(r.id, true);
  }

  return (
    <div className="mt-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {missing > 0 && (
          <button type="button" onClick={writeMissing} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy === "write" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Write {missing} missing {missing === 1 ? "summary" : "summaries"}
          </button>
        )}
        {toApprove.length > 0 && (
          <button type="button" onClick={approveAll} disabled={!!busy} className="rounded-full border border-emerald-600 px-4 py-1.5 text-[13px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-300 dark:hover:bg-emerald-950/30">
            Approve all {toApprove.length} after reading
          </button>
        )}
        <span className="text-[12.5px] text-slate-500">
          {rows.filter((r) => r.approvedAt && !r.changed).length} of {rows.length} approved for the client.
        </span>
        {message && <span className="text-[12.5px] font-medium text-slate-600 dark:text-slate-300">{message}</span>}
      </div>

      <ul className="space-y-3">
        {rows.map((r) => {
          const ok = !!r.approvedAt && !r.changed;
          return (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/candidates/${r.id}`} target="_blank" rel="noopener noreferrer" className="text-[14.5px] font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100">{r.name}</Link>
                  <p className="text-xs text-slate-500">{r.line}</p>
                </div>
                <div className="flex items-center gap-2">
                  {ok ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[12px] font-medium text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><Check className="h-3.5 w-3.5" /> Approved</span>
                  ) : r.brief ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{r.changed ? "Changed since approval" : "Not approved"}</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">No summary yet</span>
                  )}
                  {r.brief && !ok && (
                    <button type="button" disabled={!!busy} onClick={() => approve(r.id, true)} className="rounded-full bg-emerald-600 px-3 py-1 text-[12.5px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {busy === r.id ? "Saving…" : r.changed ? "Approve new version" : "Approve"}
                    </button>
                  )}
                  {r.approvedAt && (
                    <button type="button" disabled={!!busy} onClick={() => approve(r.id, false)} className="rounded-full border border-slate-300 px-3 py-1 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">Withdraw</button>
                  )}
                </div>
              </div>
              {r.brief && (
                <div className="mt-3 space-y-2 text-[13px] text-slate-700 dark:text-slate-200">
                  <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{r.brief.headline}</p>
                  <p className="leading-6">{r.brief.summary}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {r.brief.selling.length > 0 && (
                      <div>
                        <p className="mb-0.5 text-[12px] font-medium text-slate-500">Selling track record</p>
                        <ul className="list-disc space-y-0.5 pl-5">{r.brief.selling.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    )}
                    {r.brief.strengths.length > 0 && (
                      <div>
                        <p className="mb-0.5 text-[12px] font-medium text-slate-500">Strengths</p>
                        <ul className="list-disc space-y-0.5 pl-5">{r.brief.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
                      </div>
                    )}
                  </div>
                  {r.brief.probe.length > 0 && (
                    <div>
                      <p className="mb-0.5 text-[12px] font-medium text-slate-500">To confirm on the call (the client sees this wording)</p>
                      <ul className="list-disc space-y-0.5 pl-5">{r.brief.probe.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
