"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MEASURES } from "@/lib/lab/calc";

const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";

export function ProfileForm({ initial, done }: { initial: { full_name: string; designation: string; function: string; team_size: string; years_experience: string; city: string; phone: string }; done: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [open, setOpen] = useState(!done);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lab/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    setMsg(j.done ? "Saved." : "Saved. Add your designation, team size and years of experience to complete this step.");
    if (j.done) setOpen(false);
    router.refresh();
  }
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your details {done && <span className="ml-2 text-xs font-medium text-emerald-700">Done</span>}</h2>
        {done && <button onClick={() => setOpen(!open)} className="text-xs font-medium text-teal-700">{open ? "Hide" : "Edit"}</button>}
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-500">Full name<input className={input} value={f.full_name} onChange={set("full_name")} /></label>
          <label className="text-xs text-slate-500">Designation<input className={input} value={f.designation} onChange={set("designation")} placeholder="For example Sales Manager" /></label>
          <label className="text-xs text-slate-500">Function or team<input className={input} value={f.function} onChange={set("function")} placeholder="For example Inside sales" /></label>
          <label className="text-xs text-slate-500">Team size (reps)<input className={input} inputMode="numeric" value={f.team_size} onChange={set("team_size")} /></label>
          <label className="text-xs text-slate-500">Years of experience<input className={input} inputMode="numeric" value={f.years_experience} onChange={set("years_experience")} /></label>
          <label className="text-xs text-slate-500">City<input className={input} value={f.city} onChange={set("city")} /></label>
          <label className="text-xs text-slate-500">Mobile (optional)<input className={input} inputMode="tel" value={f.phone} onChange={set("phone")} /></label>
          <div className="flex items-end"><button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save details"}</button></div>
        </div>
      )}
      {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}
    </section>
  );
}

type V = { value: string; period: string; source: string; note: string };
export type InitialValues = Record<string, { baseline: V; endline: V }>;

export function MeasuresForm({ initial, phase, title, blurb }: { initial: InitialValues; phase: "baseline" | "endline"; title: string; blurb: string }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, V>>(() => Object.fromEntries(MEASURES.map((m) => [m.key, initial[m.key]?.[phase] ?? { value: "", period: "", source: "", note: "" }])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const upd = (k: string, p: keyof V, v: string) => setVals({ ...vals, [k]: { ...vals[k], [p]: v } });
  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lab/measures", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, values: vals }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{blurb}</p>
      <div className="mt-4 space-y-4">
        {MEASURES.map((m) => (
          <div key={m.key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <p className="text-sm font-medium">{m.label} <span className="font-normal text-slate-500">({m.unit})</span></p>
            <p className="text-xs text-slate-500">{m.defaultDefinition}. Source: {m.defaultSource}.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input className={input} inputMode="decimal" placeholder={m.hint} value={vals[m.key].value} onChange={(e) => upd(m.key, "value", e.target.value.replace(/[^0-9.]/g, ""))} />
              <input className={input} placeholder="Period, e.g. last 4 weeks" value={vals[m.key].period} onChange={(e) => upd(m.key, "period", e.target.value)} />
              <input className={input} placeholder="Report or system used" value={vals[m.key].source} onChange={(e) => upd(m.key, "source", e.target.value)} />
            </div>
            <input className={`${input} mt-2`} placeholder="Context or caveat (optional)" value={vals[m.key].note} onChange={(e) => upd(m.key, "note", e.target.value)} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : `Save ${phase}`}</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}

export function AssignmentToggle({ sessionN, done }: { sessionN: number; done: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(done);
  async function flip() {
    const next = !on;
    setOn(next);
    const res = await fetch("/api/lab/assignments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionN, done: next }) });
    if (!res.ok) setOn(!next);
    else router.refresh();
  }
  return (
    <button onClick={flip} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${on ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
      {on ? "Assignment done" : "Mark assignment done"}
    </button>
  );
}
