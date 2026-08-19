"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2, Sparkles, Loader2 } from "lucide-react";
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
  const router = useRouter();
  const [view, setView] = useState<"board" | "table">("table");
  const [scoring, setScoring] = useState(false);
  const [scoreMessage, setScoreMessage] = useState<string | null>(null);
  // Board/Table both seed local state from `rows` on mount only (see the
  // stageFilter key comment below) -- router.refresh() alone re-fetches the
  // rows prop but does NOT force either child to pick it up, since neither
  // remounts on its own. Bumping this whenever `rows` actually changes (a
  // new array reference lands from the server) and folding it into `key`
  // forces a clean remount so any server-side data change -- Score
  // pipeline, a stage edit elsewhere, another tab -- actually shows up here.
  const [dataVersion, setDataVersion] = useState(0);
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    setDataVersion((v) => v + 1);
  }, [rows]);

  // Backfills match_score for candidates already on this pipeline who never
  // went through the Matching Workspace's "Add to pipeline" (bulk sourcing,
  // quick-apply, manual add, LinkedIn sourcing promotion, etc. never got a
  // score snapshotted). New candidates linked going forward get scored
  // automatically (see the candidate_mandate_links DB trigger) -- this is
  // just for everyone already here before that existed.
  async function scorePipeline() {
    setScoring(true);
    setScoreMessage(null);
    try {
      const res = await fetch("/api/mandate-match-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId: mandateContext.mandateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScoreMessage(json.error ?? "Scoring failed.");
      } else {
        setScoreMessage(
          `Scored ${json.scored} of ${json.consideredCount} candidate${json.consideredCount === 1 ? "" : "s"}${json.truncated ? " (pipeline is larger than the scoring cap)" : ""}.`
        );
        // The rows-changed effect above bumps dataVersion once the
        // refreshed rows prop actually lands from the server.
        router.refresh();
      }
    } catch {
      setScoreMessage("Scoring failed. Please try again.");
    } finally {
      setScoring(false);
    }
  }

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
        <div className="flex items-center gap-2 shrink-0">
          {rows.length > 0 && (
            <button
              onClick={scorePipeline}
              disabled={scoring}
              title="Score every candidate already on this pipeline against this mandate"
              className="flex items-center gap-1.5 text-[12px] text-purple-600 hover:underline disabled:opacity-50"
            >
              {scoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {scoring ? "Scoring..." : "Score pipeline"}
            </button>
          )}
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
      </div>
      {scoreMessage && <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-1 mb-2">{scoreMessage}</p>}

      {view === "board" ? (
        <MandateCandidatesBoard
          // Both Board and Table seed their own local state from `rows` on
          // mount (for optimistic stage-drag/edit updates) and never resync
          // to a changed prop -- keying on the filter AND dataVersion forces
          // a clean remount both when the filter changes and whenever the
          // underlying rows actually change server-side (e.g. Score
          // pipeline writing new match_score values).
          key={`${stageFilter}-${dataVersion}`}
          rows={filteredRows}
          mandateContext={mandateContext}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          applicationAnswersByCandidate={applicationAnswersByCandidate}
          resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        />
      ) : (
        <MandateCandidatesTable
          key={stageFilter}
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
