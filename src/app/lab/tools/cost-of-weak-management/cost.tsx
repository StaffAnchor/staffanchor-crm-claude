"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COST_FIELDS, attritionCost } from "@/lib/lab/calc";
import { cardCls, fieldCls } from "@/components/lab/styles";

const rs = (n: number) => `Rs ${n.toLocaleString("en-IN")}`;

export default function Cost({ initial }: { initial: Record<string, string> }) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: string) => (v[k] === "" || v[k] == null ? null : Number(v[k]));
  const annual = attritionCost(num("attrition_count"), num("replacement_cost"));
  async function save() {
    setMsg(null);
    const res = await fetch("/api/lab/cost", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: v }) });
    const j = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : j.error ?? "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <section className={cardCls}>
      <div className="space-y-3">
        {COST_FIELDS.map((f) => (
          <div key={f.key} className="grid items-center gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-[1.4fr_1fr_9rem] dark:bg-slate-800/50">
            <div><p className="text-sm font-medium">{f.label}</p><p className="text-xs text-slate-500">{f.how} · {f.source}</p></div>
            <p className="text-xs text-slate-500">{f.unit}</p>
            <input className={fieldCls} inputMode="decimal" value={v[f.key] ?? ""} onChange={(e) => setV({ ...v, [f.key]: e.target.value.replace(/[^0-9.]/g, "") })} />
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-teal-50 p-4 ring-1 ring-teal-100 dark:bg-teal-950/20 dark:ring-teal-900">
        <p className="text-xs text-teal-900 dark:text-teal-200">Estimated annual cost of avoidable attrition</p>
        <p className="text-2xl font-semibold text-teal-900 dark:text-teal-100">{annual != null ? rs(annual) : "–"}</p>
        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">Reps who left within 12 months multiplied by the replacement cost you entered. It uses your own figures only.</p>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} className="rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800">Save my numbers</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </section>
  );
}
