"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { forecastSummary, type Band } from "@/lib/lab/calc";

export type Row = { month: string; commit: string; bestCase: string; actual: string; why: string };
const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const n = (s: string) => (s.trim() === "" ? null : Number(s));
const monthLabel = (m: string) => (m ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : "");

export default function Tracker({ initial, unit: unit0, band }: { initial: Row[]; unit: string; band: Band }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [unit, setUnit] = useState(unit0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const sum = useMemo(() => forecastSummary(rows.filter((r) => r.month).map((r) => ({ month: r.month, commit: n(r.commit), actual: n(r.actual) })), band), [rows, band]);
  const acc = (r: Row) => sum.rows.find((x) => x.month === r.month);

  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => {
    const last = rows.map((r) => r.month).filter(Boolean).sort().pop();
    const d = last ? new Date(`${last}-01T00:00:00Z`) : new Date();
    if (last) d.setUTCMonth(d.getUTCMonth() + 1);
    setRows([...rows, { month: d.toISOString().slice(0, 7), commit: "", bestCase: "", actual: "", why: "" }]);
  };
  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/lab/forecast", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit, months: rows }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  async function feed(phase: "baseline" | "endline") {
    if (sum.avgAccuracy == null) return;
    const res = await fetch("/api/lab/measures", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, values: { forecast_accuracy: { value: sum.avgAccuracy, period: `${sum.months} months`, source: "Forecast Tracker", note: "" } } }) });
    setMsg(res.ok ? `Saved ${sum.avgAccuracy}% as your ${phase} forecast accuracy.` : "Couldn't save that to your measures.");
    if (res.ok) router.refresh();
  }
  const pill = (r: string | null | undefined) => (r === "Accurate" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : r === "Over-called" ? "bg-rose-50 text-rose-700 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-slate-500">Months tracked</p><p className="text-2xl font-semibold">{sum.months}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Average accuracy</p><p className="text-2xl font-semibold">{sum.avgAccuracy ?? "–"}{sum.avgAccuracy != null && "%"}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Months in {band.low}-{band.high}%</p><p className="text-2xl font-semibold">{sum.withinBand}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Over / under-called</p><p className="text-2xl font-semibold">{sum.over} / {sum.under}</p></div>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-base font-semibold">Your months</h2><p className="mt-0.5 text-xs text-slate-500">Enter the commit you gave at the start of the month, the best case, and the actual from your existing reports. Accuracy is worked out for you.</p></div>
          <label className="text-xs text-slate-500">Your unit<br /><input className={`${input} w-36`} placeholder="Rs lakh, units, deals" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-2 font-medium">Month</th><th className="px-2 font-medium">Commit</th><th className="px-2 font-medium">Best case</th><th className="px-2 font-medium">Actual</th><th className="px-2 font-medium">Accuracy</th><th className="px-2 font-medium">Read</th><th className="px-2 font-medium">Why the gap?</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const x = acc(r);
                return (
                  <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-2"><input type="month" className={input} value={r.month} onChange={(e) => set(i, "month", e.target.value)} title={monthLabel(r.month)} /></td>
                    <td className="px-2"><input className={input} inputMode="decimal" value={r.commit} onChange={(e) => set(i, "commit", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                    <td className="px-2"><input className={input} inputMode="decimal" value={r.bestCase} onChange={(e) => set(i, "bestCase", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                    <td className="px-2"><input className={input} inputMode="decimal" value={r.actual} onChange={(e) => set(i, "actual", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                    <td className="px-2 py-2.5 font-semibold tabular-nums">{x?.accuracy ?? "–"}</td>
                    <td className="px-2 py-2">{x?.read ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${pill(x.read)}`}>{x.read}</span> : <span className="text-xs text-slate-400">–</span>}</td>
                    <td className="px-2"><input className={input} value={r.why} onChange={(e) => set(i, "why", e.target.value)} placeholder="For example two large deals slipped a month" /></td>
                    <td className="px-1 py-2 text-right"><button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-red-600">Remove</button></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No months yet. Add the month you are in now.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Accuracy of 100 means the actual equalled the commit. Below {band.low} is over-called, above {band.high} is under-called. Use one unit throughout and plain numbers.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={add} disabled={rows.length >= 36} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Add a month</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </section>

      {sum.months > 0 && (
        <section className={card}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Use your average ({sum.avgAccuracy}%) as your forecast accuracy:</span>
            <button onClick={() => feed("baseline")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">As baseline</button>
            <button onClick={() => feed("endline")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">As endline</button>
          </div>
        </section>
      )}
    </div>
  );
}
