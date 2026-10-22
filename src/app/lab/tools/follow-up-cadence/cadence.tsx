"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cadenceSummary, onTimePct } from "@/lib/lab/calc";
import { cardCls, fieldCls } from "@/components/lab/tool-page";

export type Rule = { stage: string; within: string; channel: string; purpose: string; owner: string; quiet: string };
export type Check = { id: string; weekEnding: string; sampled: number; withNextStep: number; reason: string; fix: string };
const blankRule = (): Rule => ({ stage: "", within: "", channel: "", purpose: "", owner: "", quiet: "" });

export default function Cadence({ rules: r0, checks }: { rules: Rule[]; checks: Check[] }) {
  const router = useRouter();
  const [rules, setRules] = useState<Rule[]>(r0);
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ weekEnding: new Date().toISOString().slice(0, 10), sampled: "", withNextStep: "", reason: "", fix: "" });
  const sum = useMemo(() => cadenceSummary(checks), [checks]);
  const set = (i: number, k: keyof Rule, v: string) => setRules((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function saveRules() {
    setMsg(null);
    const res = await fetch("/api/lab/cadence", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) });
    setMsg(res.ok ? "Standard saved." : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  async function addCheck() {
    setMsg(null);
    const res = await fetch("/api/lab/cadence", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    setF({ ...f, sampled: "", withNextStep: "", reason: "", fix: "" });
    setMsg("Week saved.");
    router.refresh();
  }
  async function remove(id: string) {
    await fetch(`/api/lab/cadence?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  async function feed(phase: "baseline" | "endline") {
    if (sum.avgPct == null) return;
    const res = await fetch("/api/lab/measures", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phase, values: { follow_up_ontime: { value: sum.avgPct, period: `${sum.weeks} weekly checks`, source: "Follow-up Cadence weekly check", note: "" } } }) });
    setMsg(res.ok ? `Saved ${sum.avgPct}% as your ${phase} follow-ups on time.` : "Couldn't save that to your measures.");
    if (res.ok) router.refresh();
  }
  const live = f.sampled && f.withNextStep ? onTimePct(Number(f.sampled), Number(f.withNextStep)) : null;
  return (
    <div className="space-y-5">
      <section className={cardCls}>
        <h2 className="text-base font-semibold">Your standard by stage</h2>
        <p className="mt-0.5 text-xs text-slate-500">Set a standard rhythm by stage so follow-up does not depend on the individual rep. These are examples: edit them to suit your sales cycle and your CRM&apos;s stage names.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-2 font-medium">Stage</th><th className="px-2 font-medium">Follow-up within</th><th className="px-2 font-medium">Channel</th><th className="px-2 font-medium">The touch must achieve</th><th className="px-2 font-medium">Owner</th><th className="px-2 font-medium">If the buyer goes quiet</th><th /></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i} className="border-t border-slate-100 align-top dark:border-slate-800">
                  {(["stage", "within", "channel", "purpose", "owner", "quiet"] as const).map((k) => <td key={k} className="px-1 py-1.5"><input className={fieldCls} value={r[k]} onChange={(e) => set(i, k, e.target.value)} /></td>)}
                  <td className="px-1 py-2 text-right"><button onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-xs text-slate-400 hover:text-red-600">Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={() => setRules([...rules, blankRule()])} disabled={rules.length >= 12} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">Add a stage</button>
          <button onClick={saveRules} className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800">Save standard</button>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-base font-semibold">Weekly check</h2>
        <p className="mt-0.5 text-xs text-slate-500">Sample about 10 open deals. How many have a dated next step? The on-time follow-up percentage is worked out for you.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-500">Week ending<input type="date" className={fieldCls} value={f.weekEnding} onChange={(e) => setF({ ...f, weekEnding: e.target.value })} /></label>
          <label className="text-xs text-slate-500">Deals sampled<input className={fieldCls} inputMode="numeric" value={f.sampled} onChange={(e) => setF({ ...f, sampled: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="text-xs text-slate-500">With a dated next step<input className={fieldCls} inputMode="numeric" value={f.withNextStep} onChange={(e) => setF({ ...f, withNextStep: e.target.value.replace(/\D/g, "") })} /></label>
          <div className="flex items-end"><p className="pb-2 text-sm">On time <b className="text-lg">{live ?? "–"}{live != null && "%"}</b></p></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input className={fieldCls} placeholder="Common reason for a miss" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <input className={fieldCls} placeholder="Fix agreed" value={f.fix} onChange={(e) => setF({ ...f, fix: e.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button onClick={addCheck} className="rounded-xl bg-teal-700 px-5 py-2 text-sm font-semibold text-white hover:bg-teal-800">Save this week</button>
          {msg && <span className="text-sm text-slate-600">{msg}</span>}
        </div>
      </section>

      {checks.length > 0 && (
        <section className={cardCls}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-base font-semibold">Your weeks</h2><p className="text-xs text-slate-500">{sum.weeks} weeks checked · average {sum.avgPct ?? "–"}% on time · latest {sum.latestPct ?? "–"}%</p></div>
            <span className="flex items-center gap-2 text-xs text-slate-600">Use your average as your follow-ups on time:
              <button onClick={() => feed("baseline")} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">As baseline</button>
              <button onClick={() => feed("endline")} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium hover:bg-slate-50">As endline</button>
            </span>
          </div>
          <ul className="mt-3 divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{c.weekEnding}</span>
                <span className="text-slate-600">{c.withNextStep} of {c.sampled} · <b>{onTimePct(c.sampled, c.withNextStep)}%</b></span>
                <span className="text-xs text-slate-500">{[c.reason, c.fix].filter(Boolean).join(" → ")}</span>
                <button onClick={() => remove(c.id)} className="text-xs text-slate-400 hover:text-red-600">Delete</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
