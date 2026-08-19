"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import MandateCandidatesBoard from "./mandate-candidates-board";
import type { MandateScreeningContext } from "./mandate-screening-panel";
import type { ApplicationAnswer } from "./application-answers-quick-view";
import { STAGES } from "@/lib/mandate-stage";

// Thin toggle wrapper -- Board is the new default (matches the reference
// ATS screenshot the user liked). Both views now share the same bulk
// selection + actions (shortlist, email JD, email to client, add-to-group,
// reject/remove) via MandateBulkActionsBar, so the full mandateContext
// (including clientContacts/clientResources) is passed to both.
export default function MandateCandidatesView({
  rows,
  mandateContext,
  teamMembers = [],
  isAdmin = false,
  applicationAnswersByCandidate = {},
  resumeSignedUrlByCandidate = {},
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
  // Owner visibility (who this candidate belongs to) + admin-only
  // reassignment, threaded down to both Board and Table views.
  teamMembers?: { id: string; full_name: string | null; email: string }[];
  isAdmin?: boolean;
  // Per-candidate Application Question answers for this mandate, so a
  // hover on the candidate's name can quick-view them without navigating.
  applicationAnswersByCandidate?: Record<string, ApplicationAnswer[]>;
  // Per-candidate resume signed URL (1hr expiry, batch-generated server
  // side), so a "Preview resume" action can open right from the row
  // without navigating to the candidate's profile page.
  resumeSignedUrlByCandidate?: Record<string, string>;
}) {
  const [view, setView] = useState<"board" | "table">("table");
  // "all" plus every pipeline stage -- lets a recruiter narrow either view
  // down to, say, just "client_interview" instead of scrolling/scanning the
  // full pipeline. Board already visually groups by stage as columns, but
  // this still lets it hide every other column when you only care about one.
  const [stageFilter, setStageFilter] = useState<string>("all");

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.stage] = (counts[r.stage] ?? 0) + 1;
    return counts;
  }, [rows]);

  const filteredRows = useMemo(
    () => (stageFilter === "all" ? rows : rows.filter((r) => r.stage === stageFilter)),
    [rows, stageFilter]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => setStageFilter("all")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-200 ease-ros ${
              stageFilter === "all"
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            All ({rows.length})
          </button>
          {STAGES.filter((s) => stageCounts[s]).map((s) => (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize transition-colors duration-200 ease-ros ${
                stageFilter === s
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {s.replace(/_/g, " ")} ({stageCounts[s]})
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-ros-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900 shrink-0">
          <button
            onClick={() => setView("board")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-ros-md text-xs font-medium transition-all duration-200 ease-ros ${
              view === "board" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <LayoutGrid className="w-3 h-3" /> Board
          </button>
          <button
            onClick={() => setView("table")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-ros-md text-xs font-medium transition-all duration-200 ease-ros ${
              view === "table" ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <Table2 className="w-3 h-3" /> Table
          </button>
        </div>
      </div>

      {view === "board" ? (
        <MandateCandidatesBoard
          rows={filteredRows}
          mandateContext={mandateContext}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          applicationAnswersByCandidate={applicationAnswersByCandidate}
          resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        />
      ) : (
        <MandateCandidatesTable
          rows={filteredRows}
          mandateContext={mandateContext}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          applicationAnswersByCandidate={applicationAnswersByCandidate}
          resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        />
      )}
    </div>
  );
}
