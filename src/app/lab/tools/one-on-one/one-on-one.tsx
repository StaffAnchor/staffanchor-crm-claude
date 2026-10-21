"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ONE_ON_ONE_SEGMENTS, oneOnOneSummary } from "@/lib/lab/calc";

export type Saved = { id: string; heldOn: string; repRef: string; notes: Record<string, string>; commitment: string; dueOn: string; done: boolean | null; myFollowUp: string };
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const blank = (): Saved => ({ id: "", heldOn: new Date().toISOString().slice(0, 10), repRef: "", notes: {}, commitment: "", dueOn: "", done: null, myFollowUp: "" });

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/one-on-one", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">Date<input type="date" className={input} value={f.heldOn} onChange={(e) => setF({ ...f, heldOn: e.target.value })} /></label>
        <label className="text-xs text-slate-500">Rep ID or initials<input className={input} value={f.repRef} onChange={(e) => setF({ ...f, repRef: e.target.value })} /></label>
      </div>
      {ONE_ON_ONE_SEGMENTS.map((s) => (
        <label key={s.key} className="block text-xs text-slate-500">
          <span className="font-medium text-slate-700 dark:text-slate-300">{s.minutes} min · {s.label}</span> <span className="text-slate-400">· {s.what}</span>
          <textarea className={`${input} mt-1`} rows={2} value={f.notes[s.key] ?? ""} onChange={(e) => setF({ ...f, notes: { ...f.notes, [s.key]: e.target.value } })} placeholder="Your notes" />
        </label>
      ))}
      <div className="rounded-xl bg-teal-50 p-3 ring-1 ring-teal-100 dark:bg-teal-950/20 dark:ring-teal-900">
        <p className="text-xs font-medium text-teal-900 dark:text-teal-200">The commitment: keep it to one</p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <input className={input} value={f.commitment} onChange={(e) => setF({ ...f, commitment: e.target.value })} placeholder="For example: send a written next step after every call" />
          <input type="date" className={input} value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} title="Agreed date" />
        </div>
        <input className={`${input} mt-2`} value={f.myFollowUp} onChange={(e) => setF({ ...f, myFollowUp: e.target.value })} placeholder="My own follow-up (optional)" />
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : f.id ? "Update" : "Save one-on-one"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function OneOnOne({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const sum = useMemo(() => oneOnOneSummary(saved.map((s) => ({ repRef: s.repRef, commitment: s.commitment, dueOn: s.dueOn || null, done: s.done }))), [saved]);
  async function setDone(id: string, value: boolean | null) {
    await fetch("/api/lab/one-on-one", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action: "done", value }) });
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this one-on-one?")) return;
    await fetch(`/api/lab/one-on-one?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <section className={card}>
        <h2 className="text-base font-semibold">The 30-minute structure</h2>
        <ol className="mt-2 space-y-1.5 text-sm">
          {ONE_ON_ONE_SEGMENTS.map((s) => <li key={s.key}><span className="inline-block w-16 font-medium text-teal-700">{s.minutes}</span><span className="font-medium">{s.label}.</span> <span className="text-slate-600 dark:text-slate-300">{s.what}</span></li>)}
        </ol>
      </section>
      {sum.total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className={card}><p className="text-xs text-slate-500">One-on-ones</p><p className="text-2xl font-semibold">{sum.total}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Reps</p><p className="text-2xl font-semibold">{sum.reps}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Commitments done on time</p><p className="text-2xl font-semibold">{sum.doneOnTimePct ?? "–"}{sum.doneOnTimePct != null && "%"}</p></div>
          <div className={card}><p className="text-xs text-slate-500">Open and overdue</p><p className="text-2xl font-semibold">{sum.overdueOpen}</p></div>
        </div>
      )}
      <section className={card}>
        <h2 className="text-base font-semibold">Plan or record a one-on-one</h2>
        <p className="mt-0.5 mb-3 text-xs text-slate-500">Use this inside your existing one-on-one. Fill in before and after. Use rep IDs, not names.</p>
        <Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} />
      </section>
      {saved.length > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Commitment log</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {saved.map((r) => (
              <li key={r.id} className="py-3">
                {editing === r.id ? (
                  <Form initial={r} onDone={() => setEditing(null)} />
                ) : (
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{r.heldOn} · {r.repRef}</p>
                      <span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(r.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600">Delete</button></span>
                    </div>
                    {r.commitment ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p><span className="text-slate-500">Commitment:</span> {r.commitment}{r.dueOn ? <span className="text-slate-500"> · by {r.dueOn}</span> : null}{r.done == null && r.dueOn && r.dueOn < today ? <span className="ml-2 font-medium text-rose-700">overdue</span> : null}</p>
                        <span className="flex items-center gap-2 text-xs text-slate-500">Done by the agreed date?
                          <span className="inline-flex overflow-hidden rounded-md ring-1 ring-slate-200">
                            <button onClick={() => setDone(r.id, r.done === true ? null : true)} className={`px-2.5 py-1 ${r.done === true ? "bg-emerald-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>Y</button>
                            <button onClick={() => setDone(r.id, r.done === false ? null : false)} className={`px-2.5 py-1 ${r.done === false ? "bg-rose-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>N</button>
                          </span>
                        </span>
                      </div>
                    ) : <p className="text-slate-400">No commitment recorded.</p>}
                    {r.myFollowUp && <p className="text-slate-600"><span className="text-slate-500">My follow-up:</span> {r.myFollowUp}</p>}
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
