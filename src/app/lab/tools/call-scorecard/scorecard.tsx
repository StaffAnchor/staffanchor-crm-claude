"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { callSummary, weightedScore, type Weights } from "@/lib/lab/calc";

export type SavedCall = { id: string; repRef: string; callRef: string; scoredOn: string; ratings: Record<string, number>; note: string };

const GUIDE = ["Missing or harmful", "Attempted, weak", "Acceptable", "Good", "Strong, repeatable"];
const input = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";

export default function Scorecard({ weights, calls }: { weights: Weights; calls: SavedCall[] }) {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [rep, setRep] = useState("");
  const [callRef, setCallRef] = useState("");
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [r, setR] = useState<Record<string, number | null>>(() => Object.fromEntries(weights.map((w) => [w.key, null])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const live = weightedScore(r, weights);
  const sum = useMemo(() => callSummary(calls.map((c) => ({ repRef: c.repRef, ratings: c.ratings })), weights), [calls, weights]);
  const thisMonth = (ref: string) => calls.filter((c) => c.repRef === ref && c.scoredOn.slice(0, 7) === today.slice(0, 7)).length;
  const scoreOf = (c: SavedCall) => weightedScore(c.ratings, weights);

  async function add() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lab/call-scores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repRef: rep, callRef, scoredOn: date, ratings: r, note }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    setCallRef(""); setNote(""); setR(Object.fromEntries(weights.map((w) => [w.key, null])));
    setMsg("Call saved.");
    router.refresh();
  }
  async function remove(id: string) {
    if (!confirm("Delete this scored call?")) return;
    await fetch(`/api/lab/call-scores?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function feed(phase: "baseline" | "endline") {
    if (sum.avgScore == null) return;
    const res = await fetch("/api/lab/measures", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, values: { call_quality: { value: sum.avgScore, period: `${sum.calls} scored calls`, source: "Call Quality Scorecard", note: "" } } }) });
    setMsg(res.ok ? `Saved ${sum.avgScore} as your ${phase} call quality score.` : "Couldn't save that to your measures.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className={card}><p className="text-xs text-slate-500">Calls scored</p><p className="text-2xl font-semibold">{sum.calls}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Average score</p><p className="text-2xl font-semibold">{sum.avgScore ?? "–"} <span className="text-sm font-normal text-slate-500">/100</span></p></div>
        <div className={card}><p className="text-xs text-slate-500">Reps sampled</p><p className="text-2xl font-semibold">{sum.reps}</p></div>
      </div>

      <section className={card}>
        <h2 className="text-base font-semibold">Score a call</h2>
        <p className="mt-0.5 text-xs text-slate-500">Rate each criterion 1 to 5. If your company already has a QA form, score with that and use this for coaching notes. Sample about 5 calls per rep per month.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input className={input} placeholder="Rep ID or initials" value={rep} onChange={(e) => setRep(e.target.value)} />
          <input className={input} placeholder="Call ID from your system" value={callRef} onChange={(e) => setCallRef(e.target.value)} />
          <input className={input} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <ul className="mt-4 space-y-2.5">
          {weights.map((w) => (
            <li key={w.key} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-800 dark:text-slate-200">{w.label} <span className="text-xs text-slate-400">· weight {w.weight}</span></span>
              <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-slate-200">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" title={GUIDE[n - 1]} onClick={() => setR({ ...r, [w.key]: r[w.key] === n ? null : n })} className={`h-9 w-9 text-sm ${r[w.key] === n ? "bg-teal-700 font-semibold text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>{n}</button>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-slate-500">1 Missing or harmful · 2 Attempted, weak · 3 Acceptable · 4 Good · 5 Strong, repeatable</p>
        <input className={`${input} mt-3`} placeholder="Coaching note (optional): what worked, one thing to practise" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="text-sm">Weighted score <b className="text-lg">{live ?? "–"}</b> <span className="text-slate-500">/100</span></span>
          <button onClick={add} disabled={busy || live == null || !rep.trim()} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save call"}</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </section>

      {sum.calls > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Your reps</h2>
          <p className="mt-0.5 text-xs text-slate-500">Lowest average first. Aim for about 5 scored calls per rep each month.</p>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {sum.perRep.map((p) => (
              <li key={p.rep} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-medium">{p.rep}</span>
                <span className="text-slate-500">{p.calls} call{p.calls === 1 ? "" : "s"} · {thisMonth(p.rep)} this month</span>
                <b className={p.avg >= 75 ? "text-emerald-700" : p.avg >= 55 ? "text-amber-700" : "text-rose-700"}>{p.avg}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sum.calls > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Where calls lose points</h2>
          <p className="mt-0.5 text-xs text-slate-500">Average rating (out of 5) across all your scored calls. The lowest is where coaching should start.</p>
          <ul className="mt-3 space-y-2">
            {sum.perCriterion.map((c) => (
              <li key={c.key} className="text-sm">
                <div className="flex justify-between"><span>{c.label}</span><span className="tabular-nums text-slate-500">{c.avgRating ?? "–"} of 5</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.key === sum.weakestKey ? "bg-rose-500" : "bg-teal-500"}`} style={{ width: `${((c.avgRating ?? 0) / 5) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-800">
            <span className="text-slate-600">Use your average ({sum.avgScore}) as your call quality score:</span>
            <button onClick={() => feed("baseline")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">As baseline</button>
            <button onClick={() => feed("endline")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">As endline</button>
          </div>
        </section>
      )}

      {calls.length > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Scored calls</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Date</th><th className="px-3 font-medium">Rep</th><th className="px-3 font-medium">Call</th><th className="px-3 font-medium">Score</th><th className="px-3 font-medium">Note</th><th /></tr></thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-2 pr-3 text-slate-600">{c.scoredOn}</td><td className="px-3">{c.repRef}</td><td className="px-3 text-slate-600">{c.callRef || "–"}</td>
                    <td className="px-3 font-semibold tabular-nums">{scoreOf(c) ?? "–"}</td><td className="px-3 text-slate-600">{c.note}</td>
                    <td className="px-3 text-right"><button onClick={() => remove(c.id)} className="text-xs text-slate-400 hover:text-red-600">Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
