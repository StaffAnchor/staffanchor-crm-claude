"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SCORECARD_DEFAULT, calibration } from "@/lib/lab/calc";

const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const GUIDE = ["Missing or harmful", "Attempted, weak", "Acceptable", "Good", "Strong, repeatable"];

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/lab/calibration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, ...(await res.json().catch(() => ({}))) } as { ok: boolean; error?: string; id?: string; code?: string };
}

export function StartOrJoin() {
  const router = useRouter();
  const [callRef, setCallRef] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true); setMsg(null);
    const r = await post({ action: "create", callRef });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Couldn't start.");
    router.push(`/lab/tools/calibration/${r.id}`);
  }
  async function join() {
    setBusy(true); setMsg(null);
    const r = await post({ action: "join", code });
    setBusy(false);
    if (!r.ok) return setMsg(r.error ?? "Couldn't join.");
    router.push(`/lab/tools/calibration/${r.id}`);
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <section className={card}>
        <h2 className="text-base font-semibold">Start a calibration</h2>
        <p className="mt-0.5 text-xs text-slate-500">Pick a call you and a fellow manager will both score. You get a code to share with them.</p>
        <input className={`${input} mt-3`} placeholder="Call ID from your system" value={callRef} onChange={(e) => setCallRef(e.target.value)} />
        <button onClick={create} disabled={busy} className="mt-3 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Start and get a code</button>
      </section>
      <section className={card}>
        <h2 className="text-base font-semibold">Join with a code</h2>
        <p className="mt-0.5 text-xs text-slate-500">Your partner started one and shared a 6-character code with you.</p>
        <input className={`${input} mt-3 uppercase tracking-widest`} placeholder="Code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button onClick={join} disabled={busy || code.length !== 6} className="mt-3 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">Join</button>
      </section>
      {msg && <p className="text-sm text-red-600 sm:col-span-2">{msg}</p>}
    </div>
  );
}

export function ScoreForm({ id, initial, locked }: { id: string; initial: Record<string, number> | null; locked: boolean }) {
  const router = useRouter();
  const [r, setR] = useState<Record<string, number | null>>(() => Object.fromEntries(SCORECARD_DEFAULT.map((c) => [c.key, initial?.[c.key] ?? null])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = SCORECARD_DEFAULT.every((c) => r[c.key] != null);
  async function save() {
    setBusy(true); setMsg(null);
    const res = await post({ action: "submit", id, ratings: r });
    setBusy(false);
    setMsg(res.ok ? "Saved." : res.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">Your scores</h2>
      <p className="mt-0.5 text-xs text-slate-500">Score the call on your own. Your partner&apos;s ratings stay hidden until you have both scored it.</p>
      <ul className="mt-4 space-y-2.5">
        {SCORECARD_DEFAULT.map((c) => (
          <li key={c.key} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{c.label}</span>
            <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" disabled={locked} title={GUIDE[n - 1]} onClick={() => setR({ ...r, [c.key]: r[c.key] === n ? null : n })} className={`h-9 w-9 text-sm ${r[c.key] === n ? "bg-teal-700 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"} disabled:opacity-60`}>{n}</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">1 Missing or harmful · 2 Attempted, weak · 3 Acceptable · 4 Good · 5 Strong, repeatable</p>
      {!locked && (
        <div className="mt-4 flex items-center gap-3">
          <button onClick={save} disabled={busy || !ready} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : initial ? "Update my scores" : "Submit my scores"}</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      )}
    </section>
  );
}

export function Compare({ id, mine, theirs, partner, standards }: { id: string; mine: Record<string, number>; theirs: Record<string, number>; partner: string; standards: Record<string, string> }) {
  const router = useRouter();
  const [std, setStd] = useState<Record<string, string>>(() => Object.fromEntries(SCORECARD_DEFAULT.map((c) => [c.key, standards[c.key] ?? ""])));
  const [msg, setMsg] = useState<string | null>(null);
  const cal = calibration(mine, theirs);
  async function save() {
    const res = await post({ action: "standards", id, standards: std });
    setMsg(res.ok ? "Saved for both of you." : res.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <section className={card}>
      <h2 className="text-base font-semibold">How your scores compare</h2>
      <p className="mt-0.5 text-xs text-slate-500">A gap of 2 or more means you disagree on the standard. Talk it through, then write down what a 4 sounds like for that criterion.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Criterion</th><th className="px-3 font-medium">You</th><th className="px-3 font-medium">{partner}</th><th className="px-3 font-medium">Gap</th><th className="px-3 font-medium">Agreed standard (what a 4 sounds like)</th></tr></thead>
          <tbody>
            {SCORECARD_DEFAULT.map((c, i) => {
              const gap = cal.gaps[i];
              return (
                <tr key={c.key} className={`border-t border-slate-100 dark:border-slate-800 ${gap != null && gap >= 2 ? "bg-rose-50/60 dark:bg-rose-950/20" : ""}`}>
                  <td className="py-2.5 pr-3">{c.label}</td>
                  <td className="px-3 tabular-nums">{mine[c.key]}</td>
                  <td className="px-3 tabular-nums">{theirs[c.key]}</td>
                  <td className={`px-3 font-semibold tabular-nums ${gap != null && gap >= 2 ? "text-rose-700" : "text-slate-600"}`}>{gap}</td>
                  <td className="px-3"><input className={input} value={std[c.key]} onChange={(e) => setStd({ ...std, [c.key]: e.target.value })} placeholder={gap != null && gap >= 2 ? "Agree this one first" : "Optional"} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <span>Criteria with a gap of 2 or more: <b>{cal.bigGaps}</b></span>
        <span>Average gap: <b>{cal.avgGap ?? "–"}</b></span>
        <button onClick={save} className="rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Save agreed standards</button>
        {msg && <span className="text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}
