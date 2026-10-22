"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cardCls, fieldCls } from "@/components/lab/styles";

export type Item = { problem: string; evidence: string; baseline: string; desired: string; experiment: string; owner: string; reviewOn: string; result: string; nextStep: string };
const blank = (): Item => ({ problem: "", evidence: "", baseline: "", desired: "", experiment: "", owner: "", reviewOn: "", result: "", nextStep: "" });
const FIELDS: { k: keyof Item; label: string; ph: string; area?: boolean; type?: string }[] = [
  { k: "problem", label: "Observed problem", ph: "For example: reviews find issues but actions are not followed through", area: true },
  { k: "evidence", label: "Existing evidence (report or view)", ph: "For example: weekly review notes" },
  { k: "baseline", label: "Baseline: where it is now", ph: "Record the current pattern" },
  { k: "desired", label: "Desired change", ph: "For example: every action has an owner and a date" },
  { k: "experiment", label: "Small experiment", ph: "For example: close each review by confirming owner, date and next check", area: true },
  { k: "owner", label: "Owner", ph: "Usually you" },
  { k: "reviewOn", label: "Review date", ph: "", type: "date" },
  { k: "result", label: "Learning or result", ph: "What happened, in a sentence or two", area: true },
  { k: "nextStep", label: "Next step", ph: "What you will do next" },
];

export default function Charter({ initial }: { initial: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([0, 1, 2].map((i) => initial[i] ?? blank()));
  const [open, setOpen] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: keyof Item, v: string) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  async function save() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/lab/charter", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
    setBusy(false);
    setMsg(res.ok ? "Saved." : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-teal-50 p-4 text-sm text-teal-900 ring-1 ring-teal-200">Choose <b>one</b> practical management habit to improve first. Use existing reports for the numbers: this is for action planning, not for duplicating data. Add a second or third priority only when the first is under way.</p>
      {items.map((it, i) => (
        <section key={i} className={cardCls}>
          <button onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between text-left">
            <span className="text-base font-semibold">Priority {i + 1}{it.problem ? <span className="ml-2 text-sm font-normal text-slate-500">· {it.problem.slice(0, 70)}</span> : null}</span>
            <span className="text-xs text-teal-700">{open === i ? "Hide" : it.problem ? "Edit" : "Add"}</span>
          </button>
          {open === i && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.k} className={`text-xs text-slate-500 ${f.area ? "sm:col-span-2" : ""}`}>{f.label}
                  {f.area ? <textarea className={fieldCls} rows={2} placeholder={f.ph} value={it[f.k]} onChange={(e) => set(i, f.k, e.target.value)} /> : <input type={f.type ?? "text"} className={fieldCls} placeholder={f.ph} value={it[f.k]} onChange={(e) => set(i, f.k, e.target.value)} />}
                </label>
              ))}
            </div>
          )}
        </section>
      ))}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={busy} className="rounded-xl bg-teal-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{busy ? "Saving…" : "Save charter"}</button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>
    </div>
  );
}
