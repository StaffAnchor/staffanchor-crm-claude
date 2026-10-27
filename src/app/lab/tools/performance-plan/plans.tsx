"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PLAN_OUTCOMES, planSummary, type PlanOutcome, type PlanReview } from "@/lib/lab/calc";

export type Saved = { id: string; repRef: string; startedOn: string; gap: string; standard: string; support: string; reviews: PlanReview[]; outcome: PlanOutcome };
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const blank = (): Saved => ({ id: "", repRef: "", startedOn: new Date().toISOString().slice(0, 10), gap: "", standard: "", support: "", reviews: [], outcome: "open" });
const STATUS = [{ k: "on_track", l: "On track", c: "bg-emerald-600" }, { k: "at_risk", l: "At risk", c: "bg-amber-500" }, { k: "off_track", l: "Off track", c: "bg-rose-600" }] as const;

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/performance-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Rep ID or initials<input className={input} value={f.repRef} onChange={(e) => setF({ ...f, repRef: e.target.value })} /></label>
        <label className="text-xs text-slate-500">Plan starts<input type="date" className={input} value={f.startedOn} onChange={(e) => setF({ ...f, startedOn: e.target.value })} /></label>
      </div>
      <label className="block text-xs text-slate-500">The gap (a fact, with a record reference)<textarea className={input} rows={2} value={f.gap} onChange={(e) => setF({ ...f, gap: e.target.value })} placeholder="For example: follow-ups on time at 55% for 6 weeks (CRM view ref)" /></label>
      <label className="block text-xs text-slate-500">Expected standard in 30 days<textarea className={input} rows={2} value={f.standard} onChange={(e) => setF({ ...f, standard: e.target.value })} placeholder="For example: 80% for 3 weeks in a row" /></label>
      <label className="block text-xs text-slate-500">Support I will give<textarea className={input} rows={2} value={f.support} onChange={(e) => setF({ ...f, support: e.target.value })} placeholder="For example: a daily 10-minute check and template reminders" /></label>
      <p className="text-xs text-slate-500">Review checkpoints are set automatically at day 10, 20 and 30 from the start date.</p>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : f.id ? "Update plan" : "Save plan"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function Plans({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const sum = useMemo(() => planSummary(saved.map((p) => ({ outcome: p.outcome, reviews: p.reviews }))), [saved]);
  async function post(body: Record<string, unknown>) {
    await fetch("/api/lab/performance-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this plan?")) return;
    await fetch(`/api/lab/performance-plan?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
        <b>Use with HR and within your company policy.</b> A plan is facts, clear expectations, support and a review date. It is not a substitute for a policy process. Use the rep&apos;s ID only. These notes are private to you: your sales head and the programme team see only counts, never the text.
      </div>
      {sum.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={card}><p className="text-xs text-slate-500">Plans</p><p className="text-2xl font-semibold">{sum.total}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Open</p><p className="text-2xl font-semibold">{sum.open}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Standard met</p><p className="text-2xl font-semibold text-emerald-700">{sum.met}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Reviews overdue</p><p className="text-2xl font-semibold text-rose-700">{sum.overdueReviews}</p></div>
        </div>
      )}
      <section className={card}>
        <h2 className="text-base font-semibold">New 30-day plan</h2>
        <div className="mt-3"><Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} /></div>
      </section>
      {saved.length > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Your plans</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {saved.map((p) => (
              <li key={p.id} className="py-4">
                {editing === p.id ? (
                  <Form initial={p} onDone={() => setEditing(null)} />
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{p.repRef} <span className="font-normal text-slate-500">· started {p.startedOn}</span></p>
                      <span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(p.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600">Delete</button></span>
                    </div>
                    <p><span className="text-slate-500">Gap:</span> {p.gap}</p>
                    <p><span className="text-slate-500">Standard in 30 days:</span> {p.standard}</p>
                    {p.support && <p><span className="text-slate-500">Support:</span> {p.support}</p>}
                    <ul className="grid gap-2 sm:grid-cols-3">
                      {p.reviews.map((r) => (
                        <li key={r.day} className="rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/50">
                          <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                            <input type="checkbox" checked={r.done} onChange={(e) => post({ id: p.id, action: "review", day: r.day, done: e.target.checked })} />
                            Day {r.day} review <span className="font-normal text-slate-500">· {r.due}</span>
                            {!r.done && p.outcome === "open" && r.due < today && <span className="font-medium text-rose-700">overdue</span>}
                          </label>
                          <div className="mt-1.5 inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
                            {STATUS.map((s) => (
                              <button key={s.k} onClick={() => post({ id: p.id, action: "review", day: r.day, done: r.done, status: s.k })} className={`px-2 py-1 ${r.status === s.k ? `${s.c} text-white` : "bg-white text-slate-600 hover:bg-slate-50"}`}>{s.l}</button>
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <label className="flex items-center gap-2 text-xs text-slate-500">Outcome
                      <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800" value={p.outcome} onChange={(e) => post({ id: p.id, action: "outcome", outcome: e.target.value })}>
                        {PLAN_OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
