"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import { STAGES, applyStageChange, type Stage } from "@/lib/mandate-stage";
import type { MandateCandidateRow } from "./mandate-candidates-table";

// Kanban view of the same rows the table shows, grouped by pipeline stage --
// inspired by the reference ATS screenshot the user shared ("Look how
// beautifully they are managing candidates for a given mandate?"). Drag a
// card to a new column to change stage, same write-path (applyStageChange)
// as every other stage-change surface in the app, so notifications/history
// stay consistent. Deliberately does NOT show a fabricated numeric
// match-percentage -- this app doesn't compute one. The existing
// categorical recommendation (recruiter_assessment.overall_recommendation)
// is shown instead, colored the same way the reference badge was colored.

// Columns shown left-to-right. "rejected" and "pulled_back" are merged into
// one "Dropped" bucket at the far right, matching the Hired/In pipeline/
// Dropped counters in the reference screenshot -- a recruiter doesn't need
// two separate columns for two flavors of "not moving forward".
const BOARD_STAGES: Stage[] = STAGES.filter((s) => s !== "rejected" && s !== "pulled_back" && s !== "placed");

const STAGE_LABEL: Record<string, string> = {
  sourced: "Sourced",
  screened: "Screened",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  client_interview: "Client Interview",
  client_shortlisted: "Client Shortlisted",
  offer: "Offer",
};

const RECOMMENDATION_COLOR: Record<string, string> = {
  "strong fit": "bg-emerald-500",
  "good fit": "bg-teal-500",
  "possible fit": "bg-amber-500",
  "not a fit": "bg-rose-500",
};

function recommendationColor(rec: string | undefined) {
  if (!rec) return "bg-slate-300 dark:bg-slate-600";
  return RECOMMENDATION_COLOR[rec.toLowerCase()] ?? "bg-slate-400";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// Deterministic pastel-ish avatar color from the candidate's name, so the
// same person always gets the same color across renders/columns.
const AVATAR_COLORS = [
  "bg-blue-500", "bg-violet-500", "bg-rose-500", "bg-amber-500",
  "bg-emerald-500", "bg-cyan-500", "bg-fuchsia-500", "bg-orange-500",
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function timeAgo(iso: string | null): string {
  if (!iso) return "--";
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  return `${months}mo`;
}

export default function MandateCandidatesBoard({
  rows: initialRows,
  mandateContext,
}: {
  rows: MandateCandidateRow[];
  mandateContext: { mandateId: string; role_title: string; client_name: string };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const counters = useMemo(() => {
    const hired = rows.filter((r) => r.stage === "placed").length;
    const dropped = rows.filter((r) => r.stage === "rejected" || r.stage === "pulled_back").length;
    const inPipeline = rows.length - hired - dropped;
    return { hired, dropped, inPipeline, total: rows.length };
  }, [rows]);

  const columns = useMemo(() => {
    const grouped: Record<string, MandateCandidateRow[]> = {};
    for (const s of BOARD_STAGES) grouped[s] = [];
    grouped["placed"] = [];
    grouped["dropped"] = [];
    for (const r of rows) {
      if (r.stage === "rejected" || r.stage === "pulled_back") grouped["dropped"].push(r);
      else if (grouped[r.stage]) grouped[r.stage].push(r);
      else grouped["sourced"].push(r);
    }
    return grouped;
  }, [rows]);

  async function moveCard(row: MandateCandidateRow, newStage: Stage) {
    if (row.stage === newStage) return;
    setMovingId(row.id);
    setMessage(null);
    const prevStage = row.stage;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage } : r)));
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title} — ${mandateContext.client_name}`,
        previousStage: prevStage,
        newStage,
        source: "recruiter",
      });
      router.refresh();
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: prevStage } : r)));
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to move candidate." });
    } finally {
      setMovingId(null);
    }
  }

  function handleDrop(e: React.DragEvent, columnKey: string) {
    e.preventDefault();
    setDragOverStage(null);
    const linkId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    if (!linkId) return;
    const row = rows.find((r) => r.id === linkId);
    if (!row) return;
    const newStage: Stage = columnKey === "dropped" ? "rejected" : (columnKey as Stage);
    moveCard(row, newStage);
  }

  const allColumns: { key: string; label: string }[] = [
    ...BOARD_STAGES.map((s) => ({ key: s, label: STAGE_LABEL[s] })),
    { key: "placed", label: "Placed" },
    { key: "dropped", label: "Dropped" },
  ];

  return (
    <div className="mt-6">
      {message && (
        <div className={`mb-3 px-4 py-2 rounded-ros-md text-xs font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}

      {/* Top counters, matching the Hired / In pipeline / Dropped strip from
          the reference screenshot. */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1.5 rounded-ros-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> {counters.hired} Placed
        </div>
        <div className="flex items-center gap-1.5 rounded-ros-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-3 py-1 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" /> {counters.inPipeline} In pipeline
        </div>
        <div className="flex items-center gap-1.5 rounded-ros-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 text-xs font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" /> {counters.dropped} Dropped
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {allColumns.map((col) => {
          const colRows = columns[col.key] ?? [];
          const isOver = dragOverStage === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(col.key);
              }}
              onDragLeave={() => setDragOverStage((prev) => (prev === col.key ? null : prev))}
              onDrop={(e) => handleDrop(e, col.key)}
              className={`flex-shrink-0 w-[240px] rounded-ros-lg border transition-colors duration-150 ease-ros ${
                isOver ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/10" : "border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30"
              }`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{col.label}</span>
                <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums">{colRows.length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {colRows.map((row) => {
                  const rec = row.candidate.recruiter_assessment?.["overall_recommendation"] as string | undefined;
                  const isMoving = movingId === row.id;
                  return (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", row.id);
                        setDraggingId(row.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      className={`bg-white dark:bg-slate-900 rounded-ros-md border border-slate-200 dark:border-slate-700 p-2.5 shadow-ros-sm cursor-grab active:cursor-grabbing transition-all duration-150 ease-ros hover:-translate-y-px hover:shadow-md ${
                        draggingId === row.id ? "opacity-40" : ""
                      } ${isMoving ? "opacity-60 pointer-events-none" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className={`shrink-0 w-7 h-7 rounded-ros-full ${avatarColor(row.candidate.full_name)} text-white text-[10.5px] font-semibold flex items-center justify-center`}
                        >
                          {initials(row.candidate.full_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/candidates/${row.candidate.id}?mandateId=${mandateContext.mandateId}`}
                            className="text-[12.5px] font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600 truncate block"
                          >
                            {row.candidate.full_name}
                          </Link>
                          <p className="text-[10.5px] text-slate-400 truncate">
                            {row.candidate.sub_domain ?? "—"}
                            {row.candidate.current_employer ? ` · ${row.candidate.current_employer}` : ""}
                          </p>
                        </div>
                        {isMoving && <Loader2 className="w-3 h-3 animate-spin text-slate-400 shrink-0" />}
                      </div>

                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-medium text-white rounded-ros-full px-1.5 py-0.5 ${recommendationColor(rec)}`}
                          title={rec ?? "Not assessed"}
                        >
                          {rec ?? "Not assessed"}
                        </span>
                        {row.candidate.current_fixed_ctc && (
                          <span className="text-[10.5px] text-slate-500 dark:text-slate-400 tabular-nums">₹{row.candidate.current_fixed_ctc}L</span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                        <span title="Time in current stage">In stage: {timeAgo(row.stage_updated_at)}</span>
                        <span className="text-slate-300 dark:text-slate-600">·</span>
                        <span title="Time in pipeline since being linked to this mandate">Pipeline: {timeAgo(row.created_at)}</span>
                      </div>

                      {row.date_of_joining && (
                        <p className="mt-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                          Joining {new Date(row.date_of_joining).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </p>
                      )}
                    </div>
                  );
                })}
                {colRows.length === 0 && <p className="text-[11px] text-slate-300 dark:text-slate-600 text-center py-4">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
