"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Sample = { candidate_id: string; cluster: string; level: string; name: string; title: string | null; employer: string | null };

export default function SampleChecker({ samples, clusters, levels }: { samples: Sample[]; clusters: { slug: string; name: string }[]; levels: { value: string; label: string }[] }) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [fixing, setFixing] = useState<string | null>(null);
  const [cl, setCl] = useState("");
  const [lv, setLv] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const name = (slug: string) => clusters.find((c) => c.slug === slug)?.name ?? slug;
  const lvName = (v: string) => levels.find((l) => l.value === v)?.label ?? "level not clear";

  async function send(s: Sample, verdict: "right" | "wrong") {
    setErr(null);
    const res = await fetch("/api/admin/scorecard/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: s.candidate_id, tagged_cluster: s.cluster, tagged_level: s.level, verdict, correct_cluster: cl, correct_level: lv }),
    });
    if (!res.ok) {
      setErr(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't save.");
      return;
    }
    setDone((d) => new Set(d).add(s.candidate_id));
    setFixing(null);
    setCl("");
    setLv("");
    router.refresh();
  }

  const left = samples.filter((s) => !done.has(s.candidate_id));
  if (left.length === 0) return <p className="text-sm text-slate-500">{samples.length ? "All checked. Reload for another sample." : "No unchecked tags in this sample. Reload for another."}</p>;
  return (
    <div>
      {err && <p className="mb-2 text-sm text-rose-600">{err}</p>}
      <ul className="space-y-2">
        {left.map((s) => (
          <li key={s.candidate_id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.name}</p>
                <p className="text-xs text-slate-500">{[s.title, s.employer].filter(Boolean).join(" at ") || "No role on file"}</p>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                  Tagged: <b>{name(s.cluster)}</b>, {lvName(s.level)}
                </p>
              </div>
              <button type="button" onClick={() => send(s, "right")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white">
                Right
              </button>
              <button type="button" onClick={() => setFixing(fixing === s.candidate_id ? null : s.candidate_id)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium dark:border-slate-600">
                Wrong
              </button>
            </div>
            {fixing === s.candidate_id && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select value={cl} onChange={(e) => setCl(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
                  <option value="">Right job type…</option>
                  {clusters.map((c) => (
                    <option key={c.slug} value={c.slug}>{c.name}</option>
                  ))}
                </select>
                <select value={lv} onChange={(e) => setLv(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900">
                  <option value="">Right level…</option>
                  {levels.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
                <button type="button" disabled={!cl || !lv} onClick={() => send(s, "wrong")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
                  Save correction
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
