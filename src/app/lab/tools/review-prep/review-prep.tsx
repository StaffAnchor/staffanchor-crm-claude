"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { REVIEW_QUESTIONS, ROOT_CAUSES } from "@/lib/lab/calc";

export type Saved = { id: string; metOn: string; reportUsed: string; exceptions: string; changed: string; rootCause: string; decision: string; ownerSupport: string; actionLogged: boolean | null; followUpOn: string; followedUp: boolean };
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const blank = (): Saved => ({ id: "", metOn: new Date().toISOString().slice(0, 10), reportUsed: "", exceptions: "", changed: "", rootCause: "", decision: "", ownerSupport: "", actionLogged: null, followUpOn: "", followedUp: false });

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setF({ ...f, [k]: v });
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/review-prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  const yn = (v: boolean | null, label: string, val: boolean) => (
    <button type="button" onClick={() => set("actionLogged", f.actionLogged === val ? null : val)} className={`px-3 py-1.5 text-sm ${f.actionLogged === val ? (val ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "bg-white text-slate-600 hover:bg-slate-50"}`}>{label}</button>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Meeting date<input type="date" className={input} value={f.metOn} onChange={(e) => set("metOn", e.target.value)} /></label>
        <label className="text-xs text-slate-500">Report or dashboard used<input className={input} value={f.reportUsed} onChange={(e) => set("reportUsed", e.target.value)} placeholder="For example weekly pipeline view" /></label>
      </div>
      <label className="block text-xs text-slate-500">Top 1 to 3 exceptions<textarea className={input} rows={2} value={f.exceptions} onChange={(e) => set("exceptions", e.target.value)} placeholder="For example four deals past stage age" /></label>
      <label className="block text-xs text-slate-500">What changed since the last review?<textarea className={input} rows={2} value={f.changed} onChange={(e) => set("changed", e.target.value)} /></label>
      <div>
        <p className="text-xs text-slate-500">Root-cause guess</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ROOT_CAUSES.map((c) => (
            <button key={c.key} type="button" title={c.hint} onClick={() => set("rootCause", f.rootCause === c.key ? "" : c.key)} className={`rounded-full px-3 py-1 text-sm ring-1 ${f.rootCause === c.key ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{c.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-500">Skill: they do not know how. Will: they know but do not want to. System: the process, tool or target gets in the way. Fix the system first.</p>
      </div>
      <label className="block text-xs text-slate-500">Decision needed<input className={input} value={f.decision} onChange={(e) => set("decision", e.target.value)} placeholder="For example park or push the stuck deals" /></label>
      <label className="block text-xs text-slate-500">Owner and support needed<input className={input} value={f.ownerSupport} onChange={(e) => set("ownerSupport", e.target.value)} placeholder="Use rep IDs, not names" /></label>
      <div className="flex flex-wrap items-center gap-4">
        <div><p className="text-xs text-slate-500">Action logged in the company system?</p><span className="mt-1 inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">{yn(f.actionLogged, "Yes", true)}{yn(f.actionLogged, "No", false)}</span></div>
        <label className="text-xs text-slate-500">Follow-up date<input type="date" className={input} value={f.followUpOn} onChange={(e) => set("followUpOn", e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : f.id ? "Update review" : "Save review prep"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function ReviewPrep({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  async function toggle(id: string, value: boolean) {
    await fetch("/api/lab/review-prep", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "followed_up", value }) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this review prep?")) return;
    await fetch(`/api/lab/review-prep?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  const cause = (k: string) => ROOT_CAUSES.find((c) => c.key === k)?.label ?? "";
  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-base font-semibold">Five questions for the review</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-300">{REVIEW_QUESTIONS.map((q) => <li key={q}>{q}</li>)}</ol>
      </section>
      <section className={card}>
        <h2 className="text-base font-semibold">Prepare for a review</h2>
        <p className="mt-0.5 mb-3 text-xs text-slate-500">Prepare for the review you already hold. Do not create a parallel meeting or dashboard. Use rep IDs, not names, and no customer details.</p>
        <Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} />
      </section>
      {saved.length > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Your reviews</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {saved.map((r) => (
              <li key={r.id} className="py-3">
                {editing === r.id ? (
                  <Form initial={r} onDone={() => setEditing(null)} />
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.metOn}{r.reportUsed ? <span className="font-normal text-slate-500"> · {r.reportUsed}</span> : null}</p>
                      <span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(r.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600">Delete</button></span>
                    </div>
                    {r.exceptions && <p><span className="text-slate-500">Exceptions:</span> {r.exceptions}</p>}
                    {r.changed && <p><span className="text-slate-500">Changed:</span> {r.changed}</p>}
                    <p className="flex flex-wrap gap-x-4 text-slate-600">
                      {r.rootCause && <span>Root cause: <b>{cause(r.rootCause)}</b></span>}
                      {r.decision && <span>Decision: {r.decision}</span>}
                      {r.ownerSupport && <span>Owner: {r.ownerSupport}</span>}
                      {r.actionLogged != null && <span>Logged in company system: <b>{r.actionLogged ? "Yes" : "No"}</b></span>}
                    </p>
                    {r.followUpOn && (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={r.followedUp} onChange={(e) => toggle(r.id, e.target.checked)} />
                        Follow-up on {r.followUpOn} done
                        {!r.followedUp && r.followUpOn < today && <span className="font-medium text-rose-700">overdue</span>}
                      </label>
                    )}
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
