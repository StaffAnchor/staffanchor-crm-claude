"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Table2, Sparkles, Loader2 } from "lucide-react";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import MandateCandidatesBoard from "./mandate-candidates-board";
import type { MandateScreeningContext } from "./mandate-screening-panel";
import type { ApplicationAnswer } from "./application-answers-quick-view";
import { STAGES } from "@/lib/mandate-stage";
import { isRecruiterDrivenSource, sourceChannelLabel } from "@/lib/candidate-source-label";
import { Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
  const [scoreMessage, setScoreMessage] = useState<{ text: string; messageTone: "success" | "error" } | null>(null);
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
        setScoreMessage({ text: json.error ?? "Scoring failed.", messageTone: "error" });
      } else {
        setScoreMessage({
          text: `Scored ${json.scored} of ${json.consideredCount} candidate${json.consideredCount === 1 ? "" : "s"}${json.truncated ? " (pipeline is larger than the scoring cap)" : ""}.`,
          messageTone: "success",
        });
        // The rows-changed effect above bumps dataVersion once the
        // refreshed rows prop actually lands from the server.
        router.refresh();
      }
    } catch {
      setScoreMessage({ text: "Scoring failed. Please try again.", messageTone: "error" });
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

  // Same Source -> "Added by (recruiter)" drill-down as the main Candidates
  // page filter panel (see candidate-source-label.ts). Options are scoped
  // to whichever stage tab is active, same as the stage pills' own counts,
  // so a recruiter looking at just "Rejected" only sees sources that
  // actually appear there. All client-side, no server round trip needed --
  // a single mandate's pipeline is small enough that `rows` already has
  // everything.
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [recruiterFilter, setRecruiterFilter] = useState<string>("all");

  const stageFilteredRows = useMemo(
    () => (stageFilter === "all" ? rows : rows.filter((r) => r.stage === stageFilter)),
    [rows, stageFilter]
  );

  const sourceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of stageFilteredRows) {
      const cb = r.candidate.created_by;
      if (!cb || map.has(cb)) continue;
      map.set(cb, sourceChannelLabel(cb, r.candidate.source ?? null));
    }
    return Array.from(map.entries());
  }, [stageFilteredRows]);

  const sourceFilteredRows = useMemo(
    () => (sourceFilter === "all" ? stageFilteredRows : stageFilteredRows.filter((r) => r.candidate.created_by === sourceFilter)),
    [stageFilteredRows, sourceFilter]
  );

  // Only recruiter-driven candidates (manual add / bulk upload / LinkedIn
  // extension / LinkedIn sourcing) have a meaningful created_by_user --
  // self-service candidates simply have none, so this naturally stays
  // empty (and the control hides) unless at least one such candidate is
  // in view.
  const recruiterOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const r of sourceFilteredRows) {
      if (isRecruiterDrivenSource(r.candidate.created_by) && r.candidate.created_by_user) {
        ids.add(r.candidate.created_by_user);
      }
    }
    return Array.from(ids).map((id) => {
      const m = teamMembers.find((tm) => tm.id === id);
      return { id, label: m?.full_name?.trim() || m?.email || "Unknown" };
    });
  }, [sourceFilteredRows, teamMembers]);

  const filteredRows = useMemo(
    () => (recruiterFilter === "all" ? sourceFilteredRows : sourceFilteredRows.filter((r) => r.candidate.created_by_user === recruiterFilter)),
    [sourceFilteredRows, recruiterFilter]
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
          {sourceOptions.length > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-600 text-xs px-0.5">|</span>
              <Select
                value={sourceFilter}
                onChange={(e) => {
                  setSourceFilter(e.target.value);
                  setRecruiterFilter("all");
                }}
                title="Filter by how these candidates entered the system"
                className="w-auto rounded-full px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400"
              >
                <option value="all">All sources</option>
                {sourceOptions.map(([cb, label]) => (
                  <option key={cb} value={cb}>
                    {label}
                  </option>
                ))}
              </Select>
              {recruiterOptions.length > 0 && (
                <Select
                  value={recruiterFilter}
                  onChange={(e) => setRecruiterFilter(e.target.value)}
                  title="Drill down to which recruiter added these candidates"
                  className="w-auto rounded-full px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400"
                >
                  <option value="all">Added by: anyone</option>
                  {recruiterOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              )}
            </>
          )}
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
      {scoreMessage && (
        <Alert tone={scoreMessage.messageTone} className="-mt-1 mb-2 w-fit">
          {scoreMessage.text}
        </Alert>
      )}

      {view === "board" ? (
        <MandateCandidatesBoard
          // Both Board and Table seed their own local state from `rows` on
          // mount (for optimistic stage-drag/edit updates) and never resync
          // to a changed prop -- keying on the filter AND dataVersion forces
          // a clean remount both when the filter changes and whenever the
          // underlying rows actually change server-side (e.g. Score
          // pipeline writing new match_score values).
          key={`${stageFilter}-${sourceFilter}-${recruiterFilter}-${dataVersion}`}
          rows={filteredRows}
          mandateContext={mandateContext}
          teamMembers={teamMembers}
          isAdmin={isAdmin}
          applicationAnswersByCandidate={applicationAnswersByCandidate}
          resumeSignedUrlByCandidate={resumeSignedUrlByCandidate}
        />
      ) : (
        <MandateCandidatesTable
          // Same remount-on-data-change reasoning as Board above -- Table
          // is the default view, so this was the actual bug users hit
          // ("scores didn't update after Score pipeline"): only Board's key
          // included dataVersion, Table's didn't.
          key={`${stageFilter}-${sourceFilter}-${recruiterFilter}-${dataVersion}`}
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
