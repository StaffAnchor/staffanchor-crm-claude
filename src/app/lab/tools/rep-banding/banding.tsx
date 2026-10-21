"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FOCUS_LABEL, bandReps, type BandingSetup } from "@/lib/lab/calc";

export type Row = { repRef: string; tenure: string; output: string };
const input = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
const card = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
const FOCUS_STYLE = { diagnose: "bg-amber-50 text-amber-800 ring-amber-200", stretch: "bg-slate-100 text-slate-700 ring-slate-200", learn: "bg-emerald-50 text-emerald-700 ring-emerald-200" } as const;

export default function Banding({ initial, unit: unit0, setup }: { initial: Row[]; unit: string; setup: BandingSetup }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial.length ? initial : [{ repRef: "", tenure: "", output: "" }]);
  const [unit, setUnit] = useState(unit0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const banded = useMemo(() => bandReps(rows.filter((r) => r.repRef.trim() && r.tenure !== "").map((r) => ({ repRef: r.repRef.trim(), tenureMonths: Number(r.tenure), output: r.output === "" ? null : Number(r.output) })), setup), [rows, setup]);
  const by = (ref: string) => banded.rows.find((x) => x.repRef === ref.trim());
  const set = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/reps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ unit, reps: rows.map((r) => ({ repRef: r.repRef, tenureMonths: r.tenure, output: r.output })) }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? "Saved." : j.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  const { limits, cut } = setup;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={card}><p className="text-xs text-slate-500">Reps banded</p><p className="text-2xl font-semibold">{banded.total}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Diagnose first</p><p className="text-2xl font-semibold text-amber-700">{banded.diagnose}</p></div>
        <div className={card}><p className="text-xs text-slate-500">In band</p><p className="text-2xl font-semibold">{banded.stretch}</p></div>
        <div className={card}><p className="text-xs text-slate-500">Learn from</p><p className="text-2xl font-semibold text-emerald-700">{banded.learn}</p></div>
      </div>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-base font-semibold">Your reps</h2><p className="mt-0.5 text-xs text-slate-500">Tenure bands: Ramp up to {limits.rampUpTo} months, Developing up to {limits.developingUpTo}, Established beyond. Output is a figure you already report each month.</p></div>
          <label className="text-xs text-slate-500">Your unit<br /><input className={`${input} w-36`} placeholder="Rs lakh, deals, units" value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-2 font-medium">Rep ID</th><th className="px-2 font-medium">Tenure (months)</th><th className="px-2 font-medium">Monthly output</th><th className="px-2 font-medium">Band</th><th className="px-2 font-medium">% of band average</th><th className="px-2 font-medium">Coaching focus</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const x = r.repRef.trim() && r.tenure !== "" ? by(r.repRef) : undefined;
                return (
                  <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                    <td className="py-2 pr-2"><input className={input} value={r.repRef} onChange={(e) => set(i, "repRef", e.target.value)} placeholder="R-01" /></td>
                    <td className="px-2"><input className={input} inputMode="decimal" value={r.tenure} onChange={(e) => set(i, "tenure", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                    <td className="px-2"><input className={input} inputMode="decimal" value={r.output} onChange={(e) => set(i, "output", e.target.value.replace(/[^0-9.]/g, ""))} /></td>
                    <td className="px-2 py-2.5">{x?.band ?? "–"}</td>
                    <td className="px-2 py-2.5 tabular-nums">{x?.pct != null && !x.alone ? `${x.pct}%` : "–"}</td>
                    <td className="px-2 py-2">{x ? (x.alone ? <span className="text-xs text-slate-400">Only rep in this band</span> : x.focus ? <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${FOCUS_STYLE[x.focus]}`}>{FOCUS_LABEL[x.focus]}</span> : <span className="text-xs text-slate-400">Add output</span>) : <span className="text-xs text-slate-400">–</span>}</td>
                    <td className="px-1 py-2 text-right"><button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-red-600">Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">Each rep is compared with the average of their own tenure band, not the whole team. Below {cut.low}% of the band average: diagnose skill, will or system. {cut.low} to {cut.high}%: in band, stretch. Above {cut.high}%: learn from them and retain them. Use this to decide where coaching time goes, not to rank or reward people. IDs only, no names.</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={() => setRows([...rows, { repRef: "", tenure: "", output: "" }])} disabled={rows.length >= 60} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Add a rep</button>
          <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save"}</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </section>

      {banded.total > 0 && (
        <section className={card}>
          <h2 className="text-base font-semibold">Your team by tenure band</h2>
          <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {banded.perBand.map((b) => <li key={b.band} className="flex items-center justify-between py-2"><span>{b.band}</span><span className="text-slate-500">{b.reps} rep{b.reps === 1 ? "" : "s"}{b.avg != null ? ` · average output ${b.avg}${unit ? ` ${unit}` : ""}` : ""}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
