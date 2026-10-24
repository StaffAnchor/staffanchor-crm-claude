"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BoardCandidate, BoardRole } from "@/lib/hiring-board";

const FIT = {
  strong: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  possible: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
};

export default function Board({ roles, candidates }: { roles: BoardRole[]; candidates: BoardCandidate[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, true>>({});
  const roleName = useMemo(() => Object.fromEntries(roles.map((r) => [r.id, r.title])), [roles]);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function add(pairs: { candidateId: string; mandateId: string; score: number }[], label: string) {
    if (!pairs.length) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/hiring/add", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pairs }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(j.error ?? "That didn't work.");
      else {
        setDone((d) => ({ ...d, ...Object.fromEntries(pairs.map((p) => [`${p.candidateId}:${p.mandateId}`, true as const])) }));
        setMsg(`${label}: added ${j.added}${j.already ? `, ${j.already} were already there` : ""}.`);
      }
    } catch {
      setMsg("The connection dropped. Check before trying again.");
    }
    setBusy(false);
  }

  const chosen = candidates.filter((c) => sel.has(c.id));
  const toRole = (mid: string) =>
    add(
      chosen.filter((c) => c.cells[mid]).map((c) => ({ candidateId: c.id, mandateId: mid, score: c.cells[mid].score })),
      roleName[mid],
    );
  const toBest = () => add(chosen.map((c) => ({ candidateId: c.id, mandateId: c.bestRoleId, score: c.bestScore })), "Best-fit roles");
  const toAll = () =>
    add(
      chosen.flatMap((c) => Object.entries(c.cells).map(([mid, cell]) => ({ candidateId: c.id, mandateId: mid, score: cell.score }))),
      "All roles",
    );
  const ask = chosen.length
    ? `Draft a short WhatsApp message to each of these people about the role they fit best, with one approval for the batch: ${chosen
        .map((c) => `${c.name} (${roleName[c.bestRoleId]})`)
        .join("; ")}.`
    : "";

  return (
    <div>
      <div className="sticky top-16 z-20 -mx-1 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{sel.size} selected</span>
        <button disabled={!sel.size || busy} onClick={toBest} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-40">
          Add to their best-fit role
        </button>
        <button disabled={!sel.size || busy} onClick={toAll} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Add to every role they fit
        </button>
        {ask ? (
          <Link href={`/agent?ask=${encodeURIComponent(ask)}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
            Draft messages (you approve first)
          </Link>
        ) : null}
        {msg ? <span className="text-[13px] text-slate-600 dark:text-slate-300">{msg}</span> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full min-w-[760px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-slate-200 text-[12px] text-slate-500 dark:border-slate-700">
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">Candidate</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[150px] px-3 py-2 align-bottom">
                  <Link href={`/mandates/${r.id}`} className="block font-semibold text-slate-800 hover:underline dark:text-slate-100">
                    {r.title}
                  </Link>
                  <span className="block font-normal text-slate-500">{[r.client, r.city].filter(Boolean).join(" · ")}</span>
                  <button disabled={!sel.size || busy} onClick={() => toRole(r.id)} className="mt-1 text-[12px] font-medium text-teal-700 underline disabled:opacity-40 dark:text-teal-300">
                    Add selected
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 && (
              <tr>
                <td colSpan={roles.length + 2} className="px-4 py-8 text-center text-slate-500">
                  No suggested matches for these roles yet.
                </td>
              </tr>
            )}
            {candidates.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 align-top last:border-0 dark:border-slate-800">
                <td className="px-3 py-2.5">
                  <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} className="h-4 w-4" />
                </td>
                <td className="px-3 py-2.5">
                  <Link href={`/candidates/${c.id}`} className="font-medium text-slate-900 hover:underline dark:text-slate-100">
                    {c.name}
                  </Link>
                  <span className="block text-slate-500">{c.headline}</span>
                  <span className="block text-[12px] text-slate-400">{[c.city, c.years != null ? `${c.years} yrs` : "", c.ctc, c.notice].filter(Boolean).join(" · ")}</span>
                </td>
                {roles.map((r) => {
                  const cell = c.cells[r.id];
                  if (!cell) return <td key={r.id} className="px-3 py-2.5 text-slate-300">–</td>;
                  const added = done[`${c.id}:${r.id}`] || cell.inPipelineStage;
                  return (
                    <td key={r.id} className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ring-1 ${FIT[cell.fit]}`}>
                        {cell.score}
                        {c.bestRoleId === r.id ? <span title="Best fit">★</span> : null}
                      </span>
                      {added ? <span className="mt-1 block text-[12px] text-slate-500">{cell.inPipelineStage ? `In pipeline: ${cell.inPipelineStage.replace(/_/g, " ")}` : "Added"}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
