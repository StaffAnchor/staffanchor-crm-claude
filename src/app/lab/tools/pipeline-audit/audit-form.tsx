"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AUDIT_CHECKS, auditComplete, auditScore, auditSummary } from "@/lib/lab/calc";

type Deal = { dealRef: string; answers: (boolean | null)[]; action: string };
const blank = (): Deal => ({ dealRef: "", answers: AUDIT_CHECKS.map(() => null), action: "" });

export default function AuditForm({ initial }: { initial: Deal[] }) {
  const router = useRouter();
  const [deals, setDeals] = useState<Deal[]>(() => Array.from({ length: 10 }, (_, i) => initial[i] ?? blank()));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sum = useMemo(() => auditSummary(deals), [deals]);

  const setAnswer = (i: number, c: number, v: boolean) => setDeals((ds) => ds.map((d, k) => (k === i ? { ...d, answers: d.answers.map((a, j) => (j === c ? (a === v ? null : v) : a)) } : d)));
  const setField = (i: number, f: "dealRef" | "action", v: string) => setDeals((ds) => ds.map((d, k) => (k === i ? { ...d, [f]: v } : d)));

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lab/pipeline-audit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deals: deals.map((d, i) => ({ position: i + 1, ...d })) }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }

  const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
  return (
    <div className="space-y-4">
      <div className="sticky top-0 z-10 grid grid-cols-3 gap-3 rounded-2xl border border-slate-200 bg-white/95 p-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div><p className="text-xs text-slate-500">Deals completed</p><p className="text-xl font-semibold">{sum.completed} <span className="text-sm font-normal text-slate-500">of 10</span></p></div>
        <div><p className="text-xs text-slate-500">Average score</p><p className="text-xl font-semibold">{sum.avgScore ?? "–"} <span className="text-sm font-normal text-slate-500">of 9</span></p></div>
        <div><p className="text-xs text-slate-500">Fix first</p><p className="text-sm font-semibold leading-tight">{sum.weakestIndex == null ? "–" : `${sum.weakestIndex + 1}. ${AUDIT_CHECKS[sum.weakestIndex]}`}</p></div>
      </div>

      {deals.map((d, i) => {
        const complete = auditComplete(d.answers);
        return (
          <section key={i} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800">{i + 1}</span>
              <input className={`${input} max-w-[14rem]`} placeholder="Your CRM deal ID" value={d.dealRef} onChange={(e) => setField(i, "dealRef", e.target.value)} />
              <span className="ml-auto text-sm">{complete ? <b className={auditScore(d.answers) >= 7 ? "text-emerald-700" : auditScore(d.answers) >= 5 ? "text-amber-700" : "text-rose-700"}>{auditScore(d.answers)} of 9</b> : <span className="text-xs text-slate-400">{d.answers.filter((a) => a !== null).length} of 9 answered</span>}</span>
            </div>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {AUDIT_CHECKS.map((label, c) => (
                <li key={label} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700 dark:text-slate-300">{c + 1}. {label}</span>
                  <span className="inline-flex shrink-0 overflow-hidden rounded-md text-xs ring-1 ring-slate-200">
                    <button type="button" onClick={() => setAnswer(i, c, true)} className={`px-2.5 py-1 ${d.answers[c] === true ? "bg-emerald-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>Y</button>
                    <button type="button" onClick={() => setAnswer(i, c, false)} className={`px-2.5 py-1 ${d.answers[c] === false ? "bg-rose-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>N</button>
                  </span>
                </li>
              ))}
            </ul>
            <input className={`${input} mt-3`} placeholder="What I will do (for example: find the decision maker before the next call)" value={d.action} onChange={(e) => setField(i, "action", e.target.value)} />
          </section>
        );
      })}

      {sum.completed > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Where your pipeline is weakest</h2>
          <p className="mt-0.5 text-xs text-slate-500">How many of your {sum.completed} audited deals answered No on each check. The longest bar is the pipeline habit to fix first.</p>
          <ul className="mt-3 space-y-2">
            {AUDIT_CHECKS.map((label, c) => (
              <li key={label} className="text-sm">
                <div className="flex justify-between"><span>{c + 1}. {label}</span><span className="tabular-nums text-slate-500">{sum.noCounts[c]} of {sum.completed}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c === sum.weakestIndex ? "bg-rose-500" : "bg-slate-400"}`} style={{ width: `${(sum.noCounts[c] / sum.completed) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-6 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save audit"}</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
