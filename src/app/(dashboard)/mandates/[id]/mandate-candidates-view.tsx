"use client";

import { useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import MandateCandidatesBoard from "./mandate-candidates-board";
import type { MandateScreeningContext } from "./mandate-screening-panel";
import type { ApplicationAnswer } from "./application-answers-quick-view";

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
  const [view, setView] = useState<"board" | "table">("board");

  return (
    <div>
      <div className="flex items-center justify-end gap-1 mb-1">
        <div className="inline-flex rounded-ros-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
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
          rows={rows}
          mandateContext={mandateContext}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          applicationAnswersByCandidate={applicationAnswersByCandidate}
          resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        />
      ) : (
        <MandateCandidatesTable
          rows={rows}
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
