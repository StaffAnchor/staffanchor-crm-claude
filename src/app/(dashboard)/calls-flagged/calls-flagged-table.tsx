"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_COLOR, stageLabel } from "@/lib/mandate-stage";
import CallDispositionControl from "../mandates/[id]/call-disposition-control";
import ResumePreview from "../candidates/[id]/resume-preview";
import ReassignCallControl from "./reassign-call-control";

export type FlaggedCallRow = {
  id: string;
  linkId: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  candidate_category: string | null;
  candidate_sub_domain: string | null;
  candidate_current_fixed_ctc: number | null;
  candidate_notice_period: string | null;
  candidate_resume_file_url: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  call_round: string | null;
  detail: string | null;
  created_at: string;
  stage: string | null;
  call_disposition: string | null;
  flag_status?: string;
  resolved_at?: string | null;
};

function roundLabel(round: string | null) {
  if (round === "2nd") return "2nd Round";
  if (round === "final") return "Final Round";
  return "1st Round";
}

function flagStatusBadge(status?: string) {
  if (status === "done") return { label: "Done", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" };
  if (status === "snoozed") return { label: "Snoozed", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" };
  return { label: "Open", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" };
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Mandate-pipeline-table-shaped, deliberately: same stage badge, same
// CTC/notice presentation, same "click the name to open the profile"
// pattern as mandate-candidates-table.tsx, just rows drawn from
// recruiter_inbox CANDIDATE_CALL_REQUEST flags instead of one mandate's
// full roster. `back=calls` (+ `calls_recruiter` when viewing a teammate's
// queue as admin) on the candidate link is what makes the profile page's
// "back" return here instead of to the mandate -- see candidates/[id]
// page.tsx's back handling.
export default function CallsFlaggedTable({
  rows: initialRows,
  recruiterId,
  resumeSignedUrlByCandidate = {},
  showAll = false,
  teamMembers = [],
  defaultRecruiterId,
}: {
  rows: FlaggedCallRow[];
  recruiterId?: string;
  resumeSignedUrlByCandidate?: Record<string, string>;
  showAll?: boolean;
  teamMembers?: { id: string; full_name: string | null; email: string }[];
  defaultRecruiterId?: string;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);

  const candidateHref = (r: FlaggedCallRow) => {
    if (!r.candidate_id) return "#";
    const params = new URLSearchParams();
    if (r.mandate_id) params.set("mandateId", r.mandate_id);
    params.set("back", "calls");
    if (recruiterId) params.set("calls_recruiter", recruiterId);
    return `/candidates/${r.candidate_id}?${params.toString()}`;
  };

  async function markDone(id: string) {
    // The tick mark is a single click with no undo on this row itself --
    // easy to fat-finger next to the disposition dropdown in the same
    // row. A confirm is cheap insurance; ReassignCallControl (all-time
    // view only) is the actual recovery path if it does happen.
    if (!window.confirm("Mark this call as done? This closes the flag.")) return;
    const resolvedAt = new Date().toISOString();
    if (showAll) {
      setRows((cur) => cur.map((r) => (r.id === id ? { ...r, flag_status: "done", resolved_at: resolvedAt } : r)));
    } else {
      setRows((cur) => cur.filter((r) => r.id !== id));
    }
    await supabase.from("recruiter_inbox").update({ status: "done", resolved_at: resolvedAt }).eq("id", id);
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-10 text-center">
        <p className="text-[13px] text-slate-400">Nothing flagged right now.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="text-left px-4 py-2.5">Candidate</th>
            <th className="text-left px-4 py-2.5">Resume</th>
            <th className="text-left px-4 py-2.5">Mandate</th>
            <th className="text-left px-4 py-2.5">CTC / Notice</th>
            <th className="text-left px-4 py-2.5">Round</th>
            <th className="text-left px-4 py-2.5">Flag note</th>
            <th className="text-left px-4 py-2.5">Call outcome</th>
            <th className="text-left px-4 py-2.5">Flag status</th>
            <th className="text-left px-4 py-2.5 w-10"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <td className="px-4 py-3">
                <Link href={candidateHref(r)} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600">
                  {r.candidate_name ?? "Candidate"}
                </Link>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {r.stage && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STAGE_COLOR[r.stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}>
                      {stageLabel(r.stage)}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400">{r.candidate_sub_domain}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                {r.candidate_id && resumeSignedUrlByCandidate[r.candidate_id] ? (
                  <ResumePreview
                    signedUrl={resumeSignedUrlByCandidate[r.candidate_id]}
                    fileName={(r.candidate_resume_file_url ?? `${r.candidate_name ?? "candidate"}-resume`).replace(/^resumes\//, "")}
                    label="Preview"
                  />
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {r.mandate_id ? (
                  <Link href={`/mandates/${r.mandate_id}`} className="text-[12.5px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                    {r.mandate_role_title}
                    {r.mandate_client_name ? ` — ${r.mandate_client_name}` : ""}
                  </Link>
                ) : (
                  <span className="text-[12.5px] text-slate-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-[12.5px]">
                <div>{r.candidate_current_fixed_ctc ? `₹${r.candidate_current_fixed_ctc}L` : "—"}</div>
                {r.candidate_notice_period && <div className="text-[10.5px] text-slate-400">Notice: {r.candidate_notice_period}</div>}
              </td>
              <td className="px-4 py-3">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">
                  {roundLabel(r.call_round)}
                </span>
                <div className="text-[10px] text-slate-400 mt-1">{timeAgo(r.created_at)}</div>
              </td>
              <td className="px-4 py-3 max-w-[220px]">
                {r.detail ? (
                  <p className="text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2">{r.detail}</p>
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {r.linkId && r.mandate_id && r.candidate_id ? (
                  <CallDispositionControl
                    linkId={r.linkId}
                    candidateId={r.candidate_id}
                    candidateName={r.candidate_name ?? "Candidate"}
                    mandateId={r.mandate_id}
                    mandateRoleTitle={r.mandate_role_title}
                    clientName={r.mandate_client_name}
                    currentStage={r.stage ?? "sourced"}
                    currentDisposition={r.call_disposition}
                    recruiterInboxId={r.id}
                    onApplied={(d) => {
                      // CallDispositionControl already wrote the
                      // recruiter_inbox status itself when it's not
                      // not_picked_up (see its recruiterInboxId handling)
                      // -- this just keeps local state in sync without a
                      // second write. In the "all time" analysis view we
                      // never drop a row on disposition -- the whole point
                      // is to keep seeing it with its outcome attached.
                      if (showAll) {
                        setRows((cur) =>
                          cur.map((row) =>
                            row.id === r.id
                              ? { ...row, call_disposition: d, flag_status: d !== "not_picked_up" ? "done" : row.flag_status }
                              : row
                          )
                        );
                      } else if (d !== "not_picked_up") {
                        setRows((cur) => cur.filter((row) => row.id !== r.id));
                      } else {
                        setRows((cur) => cur.map((row) => (row.id === r.id ? { ...row, call_disposition: d } : row)));
                      }
                    }}
                  />
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {(() => {
                  const badge = flagStatusBadge(r.flag_status);
                  return (
                    <div>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                      {r.resolved_at && <div className="text-[10px] text-slate-400 mt-1">{timeAgo(r.resolved_at)}</div>}
                      {showAll && r.candidate_id && (
                        <div className="mt-1">
                          <ReassignCallControl
                            flagId={r.id}
                            candidateName={r.candidate_name ?? "Candidate"}
                            mandateRoleTitle={r.mandate_role_title}
                            teamMembers={teamMembers}
                            defaultRecruiterId={defaultRecruiterId}
                            onReassigned={() => {
                              // The control just flipped this same row's
                              // status back to open server-side -- mirror
                              // that here so the badge updates without a
                              // full reload.
                              setRows((cur) =>
                                cur.map((row) =>
                                  row.id === r.id ? { ...row, flag_status: "open", resolved_at: null } : row
                                )
                              );
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </td>
              <td className="px-4 py-3">
                {r.flag_status !== "done" && (
                  <button
                    onClick={() => markDone(r.id)}
                    title="Mark done"
                    className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
