"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ONBOARDING_DEFAULT } from "@/lib/lab/calc";
import { cardCls, fieldCls } from "@/components/lab/tool-page";

type Plan = Record<"d30" | "d60" | "d90", { learn: string; do: string; prove: string }>;
export type Week = { week: number; well: string; fix: string; support: string };
export type Saved = { id: string; repRef: string; startedOn: string; plan: Plan; weeks: Week[] };
const PERIODS: { key: "d30" | "d60" | "d90"; label: string }[] = [{ key: "d30", label: "Days 1-30" }, { key: "d60", label: "Days 31-60" }, { key: "d90", label: "Days 61-90" }];
const blank = (): Saved => ({ id: "", repRef: "", startedOn: new Date().toISOString().slice(0, 10), plan: JSON.parse(JSON.stringify(ONBOARDING_DEFAULT)), weeks: [] });
const weekNow = (startedOn: string) => Math.min(13, Math.max(1, Math.floor((Date.now() - new Date(`${startedOn}T00:00:00Z`).getTime()) / 86400000 / 7) + 1));

function Form({ initial, onDone }: { initial: Saved; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState<Saved>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setMsg(null);
    const res = await fetch("/api/lab/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, id: f.id || undefined }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return setMsg(j.error ?? "Couldn't save.");
    onDone();
    router.refresh();
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-slate-500">New rep ID or initials<input className={fieldCls} value={f.repRef} onChange={(e) => setF({ ...f, repRef: e.target.value })} /></label>
        <label className="text-xs text-slate-500">Joined on<input type="date" className={fieldCls} value={f.startedOn} onChange={(e) => setF({ ...f, startedOn: e.target.value })} /></label>
      </div>
      <p className="text-xs text-slate-500">The standards below are examples. Replace them with your own.</p>
      {PERIODS.map((p) => (
        <div key={p.key} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
          <p className="text-sm font-medium">{p.label}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {(["learn", "do", "prove"] as const).map((part) => (
              <label key={part} className="text-xs text-slate-500">{part === "learn" ? "Learn" : part === "do" ? "Do" : "Prove (observable)"}
                <textarea className={fieldCls} rows={3} value={f.plan[p.key][part]} onChange={(e) => setF({ ...f, plan: { ...f.plan, [p.key]: { ...f.plan[p.key], [part]: e.target.value } } })} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">{f.id ? "Update plan" : "Save onboarding plan"}</button>
        {f.id && <button onClick={onDone} className="text-sm text-slate-500 hover:text-slate-800">Cancel</button>}
        {msg && <span className="text-sm text-red-600">{msg}</span>}
      </div>
    </div>
  );
}

function WeekLog({ plan }: { plan: Saved }) {
  const router = useRouter();
  const [week, setWeek] = useState(weekNow(plan.startedOn));
  const cur = plan.weeks.find((w) => w.week === week);
  const [v, setV] = useState({ well: cur?.well ?? "", fix: cur?.fix ?? "", support: cur?.support ?? "" });
  const pick = (n: number) => { setWeek(n); const c = plan.weeks.find((w) => w.week === n); setV({ well: c?.well ?? "", fix: c?.fix ?? "", support: c?.support ?? "" }); };
  async function save() {
    await fetch("/api/lab/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: plan.id, action: "week", week, ...v }) });
    router.refresh();
  }
  return (
    <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">Weekly check, week
        <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800" value={week} onChange={(e) => pick(Number(e.target.value))}>
          {Array.from({ length: 13 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}{plan.weeks.some((w) => w.week === n) ? " ✓" : ""}</option>)}
        </select>
        <span>{plan.weeks.length} of 13 logged</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={fieldCls} placeholder="What went well" value={v.well} onChange={(e) => setV({ ...v, well: e.target.value })} />
        <input className={fieldCls} placeholder="What to fix" value={v.fix} onChange={(e) => setV({ ...v, fix: e.target.value })} />
        <input className={fieldCls} placeholder="Support given" value={v.support} onChange={(e) => setV({ ...v, support: e.target.value })} />
      </div>
      <button onClick={save} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Save week {week}</button>
    </div>
  );
}

export default function Onboarding({ saved }: { saved: Saved[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [fresh, setFresh] = useState(0);
  async function remove(id: string) {
    if (!confirm("Delete this onboarding plan?")) return;
    await fetch(`/api/lab/onboarding?id=${id}`, { method: "DELETE" });
    router.refresh();
  }
  return (
    <div className="space-y-5">
      <section className={cardCls}><h2 className="text-base font-semibold">New rep onboarding plan</h2><div className="mt-3"><Form key={fresh} initial={blank()} onDone={() => setFresh(fresh + 1)} /></div></section>
      {saved.map((p) => (
        <section key={p.id} className={cardCls}>
          {editing === p.id ? <Form initial={p} onDone={() => setEditing(null)} /> : (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{p.repRef} <span className="font-normal text-slate-500">· joined {p.startedOn}</span></p>
                <span className="flex items-center gap-3 text-xs"><button onClick={() => setEditing(p.id)} className="text-teal-700 hover:underline">Edit</button><button onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-600">Delete</button></span>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {PERIODS.map((x) => (
                  <div key={x.key} className="rounded-xl border border-slate-200 p-2.5 text-xs dark:border-slate-700">
                    <p className="font-medium text-slate-700 dark:text-slate-200">{x.label}</p>
                    <p className="mt-1"><span className="text-slate-500">Learn:</span> {p.plan[x.key].learn}</p>
                    <p><span className="text-slate-500">Do:</span> {p.plan[x.key].do}</p>
                    <p><span className="text-slate-500">Prove:</span> {p.plan[x.key].prove}</p>
                  </div>
                ))}
              </div>
              <WeekLog plan={p} />
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
