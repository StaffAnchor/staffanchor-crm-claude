"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus } from "lucide-react";
import PipelineTemplateActions from "./pipeline-template-actions";
import { POOL_TIER_LABEL, POOL_TIER_PILL, type PoolTier } from "@/lib/talent-pool";
import type { Ranked } from "@/lib/role-match";

const GROUPS: { key: Ranked["bucket"]; label: string; blurb: string; tone: string }[] = [
  { key: "perfect", label: "Perfect", blurb: "Does this job today, sells the right thing, nothing important is off.", tone: "bg-emerald-600" },
  { key: "close", label: "Close", blurb: "One thing is different, and it says which.", tone: "bg-teal-600" },
  { key: "stretch", label: "Stretch", blurb: "More is different, but worth a look.", tone: "bg-slate-500" },
];

const PER_PAGE = 15;

const DISMISS_REASONS = [
  { value: "wrong_role", label: "Wrong kind of job" },
  { value: "wrong_level", label: "Wrong level" },
  { value: "wrong_world", label: "Sells the wrong thing" },
  { value: "wrong_city", label: "Wrong city" },
  { value: "pay_too_high", label: "Pay too high" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

export default function RankedGroups({ mandateId, ranked }: { mandateId: string; ranked: Ranked[] }) {
  const router = useRouter();
  const counts = useMemo(() => Object.fromEntries(GROUPS.map((g) => [g.key, ranked.filter((r) => r.bucket === g.key).length])) as Record<Ranked["bucket"], number>, [ranked]);
  const first = (GROUPS.find((g) => counts[g.key] > 0) ?? GROUPS[0]).key;
  const [tab, setTab] = useState<Ranked["bucket"]>(first);
  const [shown, setShown] = useState(PER_PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [why, setWhy] = useState<Set<string>>(new Set());
  const [gone, setGone] = useState<Set<string>>(new Set());

  async function dismiss(candidateId: string, reason: string) {
    if (!reason) return;
    setGone((g) => new Set(g).add(candidateId));
    const res = await fetch(`/api/mandates/${mandateId}/dismiss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidate_id: candidateId, reason }) });
    if (!res.ok) setGone((g) => new Set([...g].filter((x) => x !== candidateId)));
  }

  const list = ranked.filter((r) => r.bucket === tab && !gone.has(r.row.candidate_id));

  async function addPicked() {
    const chosen = ranked.filter((r) => picked.has(r.row.candidate_id));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidates: chosen.map((r) => ({ id: r.row.candidate_id, score: r.score, note: r.matched.slice(0, 3).join("; ") })) }),
      });
      const d = await res.json().catch(() => ({}));
      setMsg(res.ok ? `Added ${d.added} to the pipeline.` : d.error ?? "Couldn't add.");
      setPicked(new Set());
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const toggle = (id: string) => setPicked((p) => (p.has(id) ? new Set([...p].filter((x) => x !== id)) : new Set(p).add(id)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {GROUPS.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => {
              setTab(g.key);
              setShown(PER_PAGE);
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-semibold ${tab === g.key ? `${g.tone} border-transparent text-white` : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"}`}
          >
            {g.label} <span className={`rounded-full px-1.5 text-xs ${tab === g.key ? "bg-white/20" : "bg-slate-100 text-slate-600 dark:bg-slate-800"}`}>{counts[g.key]}</span>
          </button>
        ))}
        <p className="text-[12px] text-slate-500">{GROUPS.find((g) => g.key === tab)?.blurb}</p>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-[12px] text-slate-500">{msg}</span>}
          <button type="button" onClick={addPicked} disabled={busy || picked.size === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add {picked.size || ""} to pipeline
          </button>
        </div>
      </div>

      {list.length === 0 && <p className="rounded-ros-lg border border-dashed border-slate-300 p-6 text-center text-[13px] text-slate-500 dark:border-slate-700">No one in this group yet. The card may be too narrow: try adding more &quot;also fine&quot; worlds or cities.</p>}

      <ul className="space-y-2">
        {list.slice(0, shown).map((r) => {
          const c = r.row;
          return (
            <li key={c.candidate_id} className="rounded-ros-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex gap-3">
                <input type="checkbox" checked={picked.has(c.candidate_id)} onChange={() => toggle(c.candidate_id)} aria-label={`Select ${c.full_name ?? "candidate"}`} className="mt-1.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/candidates/${c.candidate_id}`} className="text-[14px] font-semibold text-teal-700 hover:underline dark:text-teal-400">
                      {c.full_name ?? "Unnamed"}
                    </Link>
                    {c.pool_tier && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${POOL_TIER_PILL[c.pool_tier as PoolTier]}`}>Pool: {POOL_TIER_LABEL[c.pool_tier as PoolTier]}</span>}
                    <span className="text-[12px] tabular-nums text-slate-400">{r.score}</span>
                  </div>
                  <p className="text-[12.5px] text-slate-500">
                    {[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                    {r.metro ? ` · ${r.metro}` : ""}
                    {c.total_experience_years != null ? ` · ${Number(c.total_experience_years)} yrs` : ""}
                    {c.expected_fixed_ctc != null ? ` · expects ${Number(c.expected_fixed_ctc)} LPA` : c.current_fixed_ctc != null ? ` · ${Number(c.current_fixed_ctc)} LPA now` : ""}
                    {c.notice_period ? ` · notice ${c.notice_period}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {(why.has(c.candidate_id) ? r.matched : r.matched.slice(0, 2)).map((m) => (
                      <span key={m} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 ring-1 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/60">
                        <Check className="h-3 w-3" /> {m}
                      </span>
                    ))}
                    {(why.has(c.candidate_id) ? r.gaps : r.gaps.slice(0, 1)).map((g) => (
                      <span key={g} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
                        ⚠ {g}
                      </span>
                    ))}
                    {(r.matched.length > 2 || r.gaps.length > 1) && (
                      <button type="button" onClick={() => setWhy((w) => (w.has(c.candidate_id) ? new Set([...w].filter((x) => x !== c.candidate_id)) : new Set(w).add(c.candidate_id)))} className="text-xs font-medium text-teal-600 hover:underline">
                        {why.has(c.candidate_id) ? "Less" : `+${Math.max(0, r.matched.length - 2) + Math.max(0, r.gaps.length - 1)} more`}
                      </button>
                    )}
                  </div>
                </div>
                <div className="shrink-0 space-y-2">
                  <select aria-label="Not a fit" value="" onChange={(e) => dismiss(c.candidate_id, e.target.value)} className="block w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                    <option value="">Not a fit…</option>
                    {DISMISS_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <PipelineTemplateActions candidateId={c.candidate_id} mandateId={mandateId} stage="sourced" missing={[]} showOpportunity />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {list.length > shown && (
        <button type="button" onClick={() => setShown((s) => s + PER_PAGE)} className="text-[13px] font-medium text-teal-600 hover:underline">
          Show {Math.min(PER_PAGE, list.length - shown)} more of {list.length - shown}
        </button>
      )}
    </div>
  );
}
