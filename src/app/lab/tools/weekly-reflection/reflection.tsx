"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROOT_CAUSES } from "@/lib/lab/calc";
import { cardCls, fieldCls } from "@/components/lab/tool-page";

export type Saved = { id: string; weekEnding: string; mattered: string; evidence: string; slipped: string; cause: string; action: string; helpFrom: string; checkNext: string };
const lastFriday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 2) % 7)); return d.toISOString().slice(0, 10); };
const blank = (): Saved => ({ id: "", weekEnding: lastFriday(), mattered: "", evidence: "", slipped: "", cause: "", action: "", helpFrom: "", checkNext: "" });

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const set = <K extends keyof Saved>(k: K, v: Saved[K]) => setF({ ...f, [k]: v });
  async function save() {
    setMsg(null);
    const res = await fetch("/api/lab/reflection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <label className="block text-xs text-slate-500">Week ending<input type="date" className={`${fieldCls} sm:max-w-[12rem]`} value={f.weekEnding} onChange={(e) => set("weekEnding", e.target.value)} /></label>
      <label className="block text-xs text-slate-500">What mattered most this week?<textarea className={fieldCls} rows={2} value={f.mattered} onChange={(e) => set("mattered", e.target.value)} placeholder="For example: stuck deals in the proposal stage" /></label>
      <label className="block text-xs text-slate-500">Evidence in your existing report<input className={fieldCls} value={f.evidence} onChange={(e) => set("evidence", e.target.value)} placeholder="For example: the weekly pipeline view" /></label>
      <label className="block text-xs text-slate-500">Where did execution slip?<textarea className={fieldCls} rows={2} value={f.slipped} onChange={(e) => set("slipped", e.target.value)} placeholder="For example: next steps were not dated" /></label>
      <div>
        <p className="text-xs text-slate-500">Likely cause</p>
        <div className="mt-1 flex flex-wrap gap-2">{ROOT_CAUSES.map((c) => <button key={c.key} type="button" title={c.hint} onClick={() => set("cause", f.cause === c.key ? "" : c.key)} className={`rounded-full px-3 py-1 text-sm ring-1 ${f.cause === c.key ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{c.label}</button>)}</div>
      </div>
      <label className="block text-xs text-slate-500">One action before the next review<input className={fieldCls} value={f.action} onChange={(e) => set("action", e.target.value)} /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-500">Who needs to help?<input className={fieldCls} value={f.helpFrom} onChange={(e) => set("helpFrom", e.target.value)} /></label>
        <label className="block text-xs text-slate-500">What will I check next week?<input className={fieldCls} value={f.checkNext} onChange={(e) => set("checkNext", e.target.value)} /></label>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">{f.id ? "Update note" : "Save reflection"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

export default function Reflection({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  async function remove(id: string) {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/lab/reflection?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  const cause = (k: string) => ROOT_CAUSES.find((c) => c.key === k)?.label ?? "";
  return (
    <div className="space-y-5">
      <section className={cardCls}><h2 className="text-base font-semibold">This week&apos;s note</h2><p className="mt-0.5 mb-3 text-xs text-slate-500">A five-minute note after your existing team review. Not a new meeting and not a second dashboard. One note per week: saving the same week again updates it.</p><Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} /></section>
      {saved.length > 0 && (
        <section className={cardCls}>
          <h2 className="text-base font-semibold">Your weeks</h2>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {saved.map((r) => (
              <li key={r.id} className="py-3">
                {editing === r.id ? <Form initial={r} onDone={() => setEditing(null)} /> : (
                  <div className="space-y-1 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Week ending {r.weekEnding}{r.cause ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">{cause(r.cause)}</span> : null}</p><span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(r.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600">Delete</button></span></div>
                    <p><span className="text-slate-500">Mattered:</span> {r.mattered}</p>
                    {r.slipped && <p><span className="text-slate-500">Slipped:</span> {r.slipped}</p>}
                    {r.action && <p><span className="text-slate-500">Action:</span> {r.action}{r.helpFrom ? ` · help from ${r.helpFrom}` : ""}</p>}
                    {r.checkNext && <p className="text-slate-600"><span className="text-slate-500">Check next week:</span> {r.checkNext}</p>}
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
