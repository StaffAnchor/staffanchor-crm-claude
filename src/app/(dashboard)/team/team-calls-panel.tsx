"use client";

import { useState } from "react";
import Link from "next/link";
import { PhoneCall, ChevronDown, ChevronUp } from "lucide-react";
import { STAGE_COLOR, stageLabel } from "@/lib/mandate-stage";

export type FlaggedCallRow = {
  id: string;
  recruiter_id: string;
  recruiter_name: string;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_category: string | null;
  candidate_sub_domain: string | null;
  candidate_current_fixed_ctc: number | null;
  candidate_notice_period: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  call_round: string | null;
  link_stage: string | null;
  created_at: string;
};

function roundLabel(round: string | null) {
  if (round === "2nd") return "2nd Round";
  if (round === "final") return "Final Round";
  return "1st Round";
}

function daysOpen(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "1 day open";
  return `${days} days open`;
}

// Answers the admin-side gap in the flag-for-call feature: a recruiter can
// see "calls flagged for me" (calls-flagged-bell.tsx), but nobody could see
// the shape of that load across the whole team -- who's sitting on 6 open
// calls vs. 0. Groups the same recruiter_inbox rows the bell reads, by
// recruiter, so an admin can spot a bottleneck at a glance and click through
// to the actual candidate/mandate to chase it.
export default function TeamCallsPanel({ rows }: { rows: FlaggedCallRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const byRecruiter = new Map<string, { name: string; calls: FlaggedCallRow[] }>();
  for (const r of rows) {
    const bucket = byRecruiter.get(r.recruiter_id) ?? { name: r.recruiter_name, calls: [] };
    bucket.calls.push(r);
    byRecruiter.set(r.recruiter_id, bucket);
  }
  const teammates = Array.from(byRecruiter.entries())
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.calls.length - a.calls.length);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <PhoneCall className="w-4 h-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Team calls</h2>
      </div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">Open call flags, by who they&apos;re on.</p>

      {teammates.length === 0 ? (
        <p className="text-[12px] text-slate-400 py-4 text-center">Nothing flagged for anyone right now.</p>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {teammates.map((t) => (
            <div key={t.id}>
              <button
                type="button"
                onClick={() => setExpanded((cur) => (cur === t.id ? null : t.id))}
                className="w-full flex items-center justify-between py-2.5 text-left"
              >
                <span className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{t.name}</span>
                <span className="flex items-center gap-1.5">
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 px-1.5 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                    {t.calls.length}
                  </span>
                  {expanded === t.id ? (
                    <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </span>
              </button>
              {expanded === t.id && (
                <div className="pb-2.5 space-y-1.5">
                  <Link
                    href={`/calls-flagged?recruiter=${t.id}`}
                    className="block text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline px-0.5"
                  >
                    View full list as a table →
                  </Link>
                  {t.calls
                    .slice()
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                    .map((c) => (
                      <Link
                        key={c.id}
                        href={
                          c.candidate_id && c.mandate_id
                            ? `/candidates/${c.candidate_id}?mandateId=${c.mandate_id}&back=calls&calls_recruiter=${t.id}`
                            : c.mandate_id
                              ? `/mandates/${c.mandate_id}`
                              : "#"
                        }
                        className="block rounded-ros-md bg-slate-50 dark:bg-slate-800/50 px-2.5 py-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                            <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300 truncate">
                              {c.candidate_name ?? "Candidate"}
                            </p>
                            {c.link_stage && (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${STAGE_COLOR[c.link_stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                              >
                                {stageLabel(c.link_stage)}
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">
                            {roundLabel(c.call_round)}
                          </span>
                        </div>
                        {c.candidate_sub_domain && <p className="text-[10.5px] text-slate-400 mt-0.5">{c.candidate_sub_domain}</p>}
                        {(c.mandate_role_title || c.mandate_client_name) && (
                          <p className="text-[11px] text-blue-600 dark:text-blue-400 truncate mt-0.5">
                            {c.mandate_role_title}
                            {c.mandate_client_name ? ` — ${c.mandate_client_name}` : ""}
                          </p>
                        )}
                        {(c.candidate_current_fixed_ctc || c.candidate_notice_period) && (
                          <p className="text-[10.5px] text-slate-400 mt-0.5">
                            {c.candidate_current_fixed_ctc ? `₹${c.candidate_current_fixed_ctc}L` : null}
                            {c.candidate_current_fixed_ctc && c.candidate_notice_period ? " · " : ""}
                            {c.candidate_notice_period ? `Notice: ${c.candidate_notice_period}` : null}
                          </p>
                        )}
                        <p className="text-[10px] text-slate-400 mt-0.5">{daysOpen(c.created_at)}</p>
                      </Link>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
