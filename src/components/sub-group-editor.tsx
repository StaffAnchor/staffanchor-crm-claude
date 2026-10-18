"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GROUP_LABEL, SUB_GROUPS } from "@/lib/sub-group";

// "Wrong group? Fix it": pick from the fixed list and it stays put.
export default function SubGroupEditor({ candidateId, group, subGroup }: { candidateId: string; group: string | null; subGroup: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [g, setG] = useState(group && group in SUB_GROUPS ? group : "b2b_sales");
  const [s, setS] = useState(subGroup ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/candidates/${candidateId}/sub-group`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ group: g, subGroup: s }) });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs font-medium text-slate-500 hover:text-teal-700 hover:underline">
        Wrong group?
      </button>
    );
  }
  const sel = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-900";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <select value={g} onChange={(e) => { setG(e.target.value); setS(""); }} className={sel}>
        {Object.keys(SUB_GROUPS).map((k) => (
          <option key={k} value={k}>{GROUP_LABEL[k]}</option>
        ))}
      </select>
      <select value={s} onChange={(e) => setS(e.target.value)} className={sel}>
        <option value="">Sub-group…</option>
        {SUB_GROUPS[g].map((x) => (
          <option key={x} value={x}>{x}</option>
        ))}
      </select>
      <button type="button" onClick={save} disabled={busy || !s} className="rounded-md bg-teal-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50">Save</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </span>
  );
}
