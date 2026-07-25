"use client";

import { useState } from "react";
import { LayoutGrid, Table2 } from "lucide-react";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import MandateCandidatesBoard from "./mandate-candidates-board";
import type { MandateScreeningContext } from "./mandate-screening-panel";

// Thin toggle wrapper -- Board is the new default (matches the reference
// ATS screenshot the user liked), but the existing Table view is kept
// intact for its bulk actions (shortlist, email JD, add-to-group,
// reject/remove, screening) which the board deliberately doesn't try to
// replicate as drag targets.
export default function MandateCandidatesView({
  rows,
  mandateContext,
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
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
          mandateContext={{
            mandateId: mandateContext.mandateId as string,
            role_title: mandateContext.role_title as string,
            client_name: mandateContext.client_name as string,
          }}
        />
      ) : (
        <MandateCandidatesTable rows={rows} mandateContext={mandateContext} />
      )}
    </div>
  );
}
