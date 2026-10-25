"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { RoleLevelSelect, RoleTypeSelect, useRoleClusters } from "@/components/role-type-fields";
import { suggestFromTitle } from "@/lib/role-type";

export type SetupRole = { id: string; title: string; client: string; city: string; cluster: string; level: string; pipeline: number };

const sel = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export default function RoleTypeSetup({ roles }: { roles: SetupRole[] }) {
  const router = useRouter();
  const clusters = useRoleClusters();
  const [vals, setVals] = useState<Record<string, { c: string; l: string }>>(() => Object.fromEntries(roles.map((r) => [r.id, { c: r.cluster, l: r.level }])));
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const ready = (id: string) => !!vals[id]?.c && !!vals[id]?.l && !saved[id];
  const readyCount = roles.filter((r) => ready(r.id)).length;

  function useSuggestions() {
    setVals((v) => {
      const next = { ...v };
      for (const r of roles) {
        const h = suggestFromTitle(r.title);
        next[r.id] = { c: next[r.id].c || h.cluster || "", l: next[r.id].l || h.level || "" };
      }
      return next;
    });
  }

  async function saveOne(id: string) {
    const v = vals[id];
    if (!v?.c || !v?.l) return false;
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    try {
      const res = await fetch(`/api/mandates/${id}/role-type`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role_cluster: v.c, seniority_band: v.l }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: d.error ?? "Couldn't save." }));
        return false;
      }
      setSaved((s) => ({ ...s, [id]: true }));
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function saveAll() {
    for (const r of roles) if (ready(r.id)) await saveOne(r.id);
    router.refresh();
  }

  const stillOpen = roles.filter((r) => !saved[r.id]).length;

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={useSuggestions} className="rounded-full border border-slate-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
          Fill in my suggestions
        </button>
        <button type="button" onClick={saveAll} disabled={readyCount === 0 || !!busy} className="inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save {readyCount} {readyCount === 1 ? "role" : "roles"}
        </button>
        <span className="text-[12.5px] text-slate-500">{stillOpen} of {roles.length} still need a type. Suggestions only fill empty boxes; nothing is saved until you press Save.</span>
      </div>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
        {roles.map((r) => {
          const hint = suggestFromTitle(r.title);
          const done = saved[r.id];
          return (
            <li key={r.id} className={`grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center ${done ? "bg-emerald-50/50 dark:bg-emerald-950/10" : ""}`}>
              <div className="min-w-0">
                <Link href={`/mandates/${r.id}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[14px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{r.title}</Link>
                <p className="truncate text-xs text-slate-500">{[r.client, r.city, r.pipeline > 0 ? `${r.pipeline} in the pipeline` : null].filter(Boolean).join(" · ")}</p>
                {!hint.cluster && !done && <p className="text-[11.5px] text-amber-700">No suggestion from this title. Choose one.</p>}
              </div>
              <RoleTypeSelect value={vals[r.id]?.c ?? ""} onChange={(c) => setVals((v) => ({ ...v, [r.id]: { ...v[r.id], c } }))} clusters={clusters} className={sel} />
              <RoleLevelSelect value={vals[r.id]?.l ?? ""} onChange={(l) => setVals((v) => ({ ...v, [r.id]: { ...v[r.id], l } }))} className={sel} />
              <div className="text-right text-[12.5px]">
                {done ? (
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700"><Check className="h-3.5 w-3.5" /> Saved</span>
                ) : (
                  <button type="button" disabled={!ready(r.id) || busy === r.id} onClick={() => saveOne(r.id)} className="rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200">
                    {busy === r.id ? "Saving…" : "Save"}
                  </button>
                )}
                {errors[r.id] && <p className="mt-0.5 text-rose-600">{errors[r.id]}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
