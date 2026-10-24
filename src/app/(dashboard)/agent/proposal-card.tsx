"use client";

import Link from "next/link";
import { useState } from "react";

// A proposal from the assistant, waiting for the admin. Messages can be edited before approving. Nothing happens until Approve.

export type Proposal = {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  payload: Record<string, unknown>;
  preview: { recipients?: { id: string; name: string }[]; skipped?: { name: string; why: string }[]; messages?: string[]; note?: string; subject?: string; fields?: Record<string, string> } | null;
  status: "pending" | "approved" | "rejected" | "failed";
  result: { ok?: boolean; message?: string; links?: { label: string; href: string }[] } | null;
  error: string | null;
};

const LABEL: Record<string, string> = { wa_reply: "WhatsApp reply", wa_template: "WhatsApp message", email: "Email", create_client: "New client", create_mandate: "New mandate (draft)", add_to_mandate: "Add to mandate", note: "Note" };
const ACTION: Record<string, string> = { wa_reply: "Approve and send", wa_template: "Approve and send", email: "Approve and send", create_client: "Approve and create", create_mandate: "Approve and create", add_to_mandate: "Approve and add", note: "Approve and save" };

export default function ProposalCard({ p: initial, onChange }: { p: Proposal; onChange?: () => void }) {
  const [p, setP] = useState(initial);
  const editable = ["wa_reply", "email", "note"].includes(p.kind);
  const original = (editable ? (p.kind === "note" ? p.payload.text : p.payload.body) : "") as string;
  const [body, setBody] = useState(original);
  const [subject, setSubject] = useState((p.payload.subject as string) ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const prev = p.preview ?? {};
  const count = prev.recipients?.length ?? 0;
  const done = p.status === "approved" || p.status === "rejected";

  async function decide(action: "approve" | "reject") {
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch(`/api/agent/proposals/${p.id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, edits: editable ? { body, subject } : undefined }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok && !j.outcome) {
        setErr(j.error ?? "That didn't work.");
      } else {
        setP((x) => ({ ...x, status: j.status ?? (action === "reject" ? "rejected" : "approved"), result: j.outcome ?? null, error: j.outcome && !j.outcome.ok ? j.outcome.message : null }));
        onChange?.();
      }
    } catch {
      setErr("The connection dropped. Check before trying again.");
    }
    setBusy(null);
  }

  const tone = p.status === "approved" ? "border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-900/10" : p.status === "rejected" ? "border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-900" : p.status === "failed" ? "border-red-300 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10" : "border-teal-300 bg-white dark:border-teal-800 dark:bg-slate-900";
  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] dark:border-slate-700 dark:bg-slate-900";

  return (
    <div className={`my-2 rounded-xl border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">{LABEL[p.kind] ?? p.kind}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{p.status === "pending" ? "Waiting for you" : p.status === "approved" ? "Done" : p.status === "rejected" ? "Rejected" : "Didn't go through"}</span>
      </div>
      <p className="mt-1.5 text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{p.title}</p>
      {p.summary && <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">{p.summary}</p>}

      {count > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {prev.recipients!.slice(0, 20).map((r) => (
            <Link key={r.id} href={p.kind === "email" && p.payload.to === "client_contact" ? "#" : `/candidates/${r.id}`} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[12px] text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200">{r.name}</Link>
          ))}
        </p>
      )}
      {(prev.skipped?.length ?? 0) > 0 && (
        <p className="mt-1.5 text-[12px] text-amber-800 dark:text-amber-300">Left out: {prev.skipped!.map((s) => `${s.name} (${s.why})`).join("; ")}</p>
      )}

      {prev.fields && (
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-[13px] sm:grid-cols-2">
          {Object.entries(prev.fields).filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-[11px] text-slate-400">{k}</dt><dd className="text-slate-800 dark:text-slate-200">{v}</dd></div>)}
        </dl>
      )}

      {editable && p.status !== "rejected" ? (
        <div className="mt-2 space-y-2">
          {p.kind === "email" && <input disabled={done || !!busy} className={input} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject" />}
          <textarea disabled={done || !!busy} rows={Math.min(10, Math.max(3, body.split("\n").length + 1))} className={input} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
        </div>
      ) : (
        (prev.messages?.length ?? 0) > 0 && (
          <div className="mt-2 space-y-1.5">
            {prev.messages!.slice(0, 2).map((m, i) => <p key={i} className="whitespace-pre-wrap rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-800 dark:bg-slate-800/60 dark:text-slate-200">{m}</p>)}
            {prev.messages!.length > 2 && <p className="text-[12px] text-slate-400">and {prev.messages!.length - 2} more like it, with each person&apos;s name</p>}
          </div>
        )
      )}
      {prev.note && <p className="mt-1.5 text-[12px] text-slate-500">{prev.note}</p>}

      {p.result?.message && <p className={`mt-2 text-[13px] font-medium ${p.result.ok ? "text-emerald-800 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{p.result.message}</p>}
      {p.status === "failed" && !p.result?.message && p.error && <p className="mt-2 text-[13px] font-medium text-red-700">{p.error}</p>}
      {p.result?.links?.map((l) => <Link key={l.href} href={l.href} className="mr-3 mt-1 inline-block text-[13px] font-medium text-teal-700 underline dark:text-teal-300">{l.label}</Link>)}
      {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}

      {(p.status === "pending" || p.status === "failed") && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => decide("approve")} disabled={!!busy} className="rounded-lg bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy === "approve" ? "Working…" : p.status === "failed" ? "Try again" : `${ACTION[p.kind] ?? "Approve"}${count > 1 ? ` (${count})` : ""}`}
          </button>
          <button onClick={() => decide("reject")} disabled={!!busy} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Reject</button>
          {editable && <span className="text-[12px] text-slate-400">You can edit the text above first.</span>}
        </div>
      )}
    </div>
  );
}
