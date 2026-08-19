"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MessageCircleQuestion } from "lucide-react";
import MandateScreeningPanel, { type MandateScreeningContext } from "./mandate-screening-panel";
import { STAGES, applyStageChange, rejectionReasonLabel, type Stage, type StageSource } from "@/lib/mandate-stage";
import MandateRejectModal from "./mandate-reject-modal";
import { StageTimeline } from "@/components/ui/stage-timeline";
import MandateBulkActionsBar from "./mandate-bulk-actions-bar";
import ApplicationAnswersQuickView, { type ApplicationAnswer } from "./application-answers-quick-view";
import ResumePreview from "../../candidates/[id]/resume-preview";
import { Zap, Sparkles, Loader2 } from "lucide-react";
import MandateAssessmentPopover from "./mandate-assessment-popover";

const STAGE_COLOR: Record<string, string> = {
  sourced: "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300",
  screened: "bg-blue-100 text-blue-800",
  shortlisted: "bg-teal-100 text-teal-800",
  submitted: "bg-indigo-100 text-indigo-800",
  client_interview: "bg-cyan-100 text-cyan-800",
  client_shortlisted: "bg-purple-100 text-purple-800",
  offer: "bg-lime-100 text-lime-800",
  placed: "bg-green-100 text-green-800",
  pulled_back: "bg-orange-100 text-orange-800",
  rejected: "bg-red-100 text-red-700",
};

// Stage index used only to decide whether adding to the client shortlist
// should auto-advance stage -- never downgrades a candidate who's already
// further along (e.g. already at client_interview) back to "submitted".
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

// Same thresholds as the Matching Workspace's scoreColor() -- keeps "what
// counts as a strong match" consistent whether a recruiter is looking at
// the match list or the pipeline table/board.
function matchScoreTone(score: number) {
  if (score >= 75) return "bg-emerald-50 text-emerald-700";
  if (score >= 50) return "bg-amber-50 text-amber-700";
  return "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400";
}

export type MandateCandidateRow = {
  id: string;
  stage: string;
  in_shortlist: boolean;
  stage_source: StageSource | null;
  stage_updated_at: string | null;
  client_decision_at: string | null;
  rejected_from_stage: string | null;
  rejection_reason: string | null;
  rejection_category: string | null;
  date_of_joining: string | null;
  created_at: string | null;
  screened: boolean;
  // Set when the candidate spent a Priority Applicant credit on this
  // specific application (jobs.staffanchor.com purchase flow) -- surfaced
  // here so the recruiter sees it before opening the profile.
  is_priority: boolean;
  // Snapshotted from the Matching Workspace at the moment this candidate was
  // added to the pipeline via "Add to pipeline" (see matches-workspace.tsx
  // addToPipeline) -- null for candidates added any other way (manual add,
  // quick-apply, LinkedIn sourcing promotion). Lets a recruiter see at a
  // glance how strong a fit the system originally thought this candidate
  // was, without leaving the Table/Board for the matching workspace.
  match_score: number | null;
  // Mandate-specific AI read -- see buildMatchAssessment in
  // candidate-match.ts. Lives on the LINK (not the candidate) precisely
  // because the whole point is that it changes per mandate: the same
  // candidate can be a Strong Fit for one role and Not a Fit for another,
  // and a field left blank (e.g. CTC not disclosed) should read as
  // "missing", never as a red flag.
  match_assessment: {
    recommendation: "Strong Fit" | "Fit with Reservations" | "Not a Fit";
    positives: string[];
    red_flags: string[];
    missing: string[];
  } | null;
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    category: string | null;
    sub_domain: string | null;
    total_experience_years: number | null;
    current_fixed_ctc: number | null;
    recruiter_assessment: Record<string, unknown> | null;
    work_mode: string | null;
    open_to_relocation: string | null;
    notice_period: string | null;
    segment_data: Record<string, unknown> | null;
    current_employer: string | null;
    career_timeline_resume: unknown;
    career_timeline_profile: unknown;
    owner_id: string | null;
    resume_file_url?: string | null;
    // Auto-computed from the resume's career timeline (see
    // computeStabilityScore) -- same field/scale as the main Candidates
    // table's Stability Score column, surfaced here too since a recruiter
    // deciding who to submit for THIS mandate shouldn't have to leave the
    // pipeline to go check it on the profile page.
    stability_score: number | null;
    // Sales-specific quick facts (quota attainment, buyer personas sold to,
    // disqualifiers) -- tiny by design, cheap to render inline.
    talent_micro_index: {
      normalized_acv_band?: string;
      buyer_personas_sold_to?: string[];
      verified_quota_attainment_pct?: number;
      disqualifiers?: string[];
    } | null;
  };
};

// Mirrors computeStabilityScore's thresholds -- see the identical helper in
// candidates-table.tsx for the full rationale; duplicated here rather than
// shared since it's a 4-line pure function and this component already
// doesn't import from that page.
function stabilityLabelForScore(score: number): "Stable" | "Some Movement" | "Frequent Job-Hopper" {
  if (score >= 71) return "Stable";
  if (score >= 36) return "Some Movement";
  return "Frequent Job-Hopper";
}

function stabilityTone(label: string) {
  if (label === "Stable") return "bg-emerald-50 text-emerald-700";
  if (label === "Some Movement") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

export default function MandateCandidatesTable({
  rows: initialRows,
  mandateContext,
  teamMembers = [],
  isAdmin = false,
  applicationAnswersByCandidate = {},
  resumeSignedUrlByCandidate = {},
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
  // Owner visibility + admin-only reassignment -- see mandate-candidates-view.tsx
  // for where these are sourced. Surfacing "who owns this candidate" here
  // (not just on the candidate's own profile page) is what stops two
  // recruiters from unknowingly working the same person on this mandate.
  teamMembers?: { id: string; full_name: string | null; email: string }[];
  isAdmin?: boolean;
  applicationAnswersByCandidate?: Record<string, ApplicationAnswer[]>;
  resumeSignedUrlByCandidate?: Record<string, string>;
}) {
  const ownerLabel = (id: string | null) => {
    if (!id) return "Unassigned";
    const m = teamMembers.find((tm) => tm.id === id);
    return m?.full_name?.trim() || m?.email || "Unknown";
  };
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [screeningRowId, setScreeningRowId] = useState<string | null>(null);
  // Which row is mid-edit on its stage select, and whether that edit is
  // being attributed to the client (vs. the recruiter's own call) --
  // separate from `rows` state since most rows are never being edited.
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [clientRelayed, setClientRelayed] = useState(false);
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [rejectModalRow, setRejectModalRow] = useState<MandateCandidateRow | null>(null);
  const [rejecting, setRejecting] = useState(false);

  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [generatingStability, setGeneratingStability] = useState<Set<string>>(new Set());
  const [reassessingIds, setReassessingIds] = useState<Set<string>>(new Set());

  // Scoped to a single candidate via the mandate-match-pipeline route's
  // optional candidateId param -- same scoring call "Score pipeline" makes
  // in bulk, just for one row: used both for a candidate that's never been
  // scored against this mandate, and for a manual "Re-assess" after their
  // profile changed.
  async function reassessCandidate(candidateId: string) {
    setReassessingIds((prev) => new Set(prev).add(candidateId));
    try {
      const res = await fetch("/api/mandate-match-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId: mandateContext.mandateId, candidateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "Couldn't assess this candidate." });
        return;
      }
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Couldn't assess this candidate." });
    } finally {
      setReassessingIds((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  }

  // Same single call the main Candidates table's inline "Generate" button
  // uses (runs the full career-timeline extraction -> stability_score ->
  // AI summary pipeline for this one candidate) -- a recruiter deciding
  // who to submit shouldn't have to leave this pipeline view to trigger it.
  async function generateStabilityScore(candidateId: string) {
    setGeneratingStability((prev) => new Set(prev).add(candidateId));
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "error", text: `Couldn't generate: ${data.error ?? "unknown error"}` });
        return;
      }
      router.refresh();
    } catch {
      setMessage({ type: "error", text: "Couldn't generate: request failed" });
    } finally {
      setGeneratingStability((prev) => {
        const next = new Set(prev);
        next.delete(candidateId);
        return next;
      });
    }
  }

  async function reassignOwner(candidateId: string, newOwnerId: string) {
    setReassigningId(candidateId);
    const { error } = await supabase.rpc("admin_reassign_candidate_owner", {
      p_candidate_id: candidateId,
      p_new_owner_id: newOwnerId || null,
    });
    setReassigningId(null);
    if (error) {
      setMessage({ type: "error", text: `Couldn't reassign: ${error.message}` });
      return;
    }
    router.refresh();
  }

  function toggleRow(linkId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  // "rejected" is deliberately NOT reachable from here -- picking it in the
  // stage <select> below opens MandateRejectModal instead (see
  // handleStageSelect), since a rejection now requires an explicit
  // who's-rejecting choice and a mandatory reason that this generic
  // save path has no UI for.
  async function saveStage(row: MandateCandidateRow, newStage: Stage) {
    setSavingStage(true);
    setMessage(null);
    try {
      const source: StageSource = clientRelayed ? "client_relayed" : "recruiter";
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source,
        // Save whenever a date is entered, not just when advancing to
        // "placed" -- a client often confirms joining well before the
        // recruiter formally marks the candidate Placed (e.g. right at
        // Offer), and that's exactly when it's worth capturing.
        dateOfJoining: dateOfJoining || undefined,
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: source, date_of_joining: dateOfJoining || r.date_of_joining } : r))
      );
      setEditingStageId(null);
      setClientRelayed(false);
      setDateOfJoining("");
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to update stage." });
    } finally {
      setSavingStage(false);
    }
  }

  // The actual rejection write path -- source/category come from the
  // modal, never from the removed checkbox+free-text combo, so a
  // rejection can no longer be saved without both being explicit.
  async function confirmReject(result: { source: Extract<StageSource, "recruiter" | "client_relayed">; category: string; note: string }) {
    if (!rejectModalRow) return;
    const row = rejectModalRow;
    setRejecting(true);
    setMessage(null);
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage: "rejected",
        source: result.source,
        rejectionCategory: result.category,
        rejectionReason: result.note || undefined,
      });
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, stage: "rejected", stage_source: result.source, rejection_category: result.category, rejection_reason: result.note || null, rejected_from_stage: r.stage }
            : r
        )
      );
      setRejectModalRow(null);
      setEditingStageId(null);
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to reject candidate." });
    } finally {
      setRejecting(false);
    }
  }

  // Lets a recruiter record/update the joining date on its own, without
  // also having to re-pick the stage -- the date-of-joining input's
  // onChange doesn't fire a save by itself (the stage <select>'s onChange
  // is what triggers saveStage above), so without this, a candidate
  // already sitting at Offer with no stage change pending would have no
  // way to persist a date the client just confirmed.
  async function saveJoiningDate(row: MandateCandidateRow) {
    if (!dateOfJoining) return;
    setSavingStage(true);
    setMessage(null);
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage: row.stage as Stage,
        source: "recruiter",
        dateOfJoining,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, date_of_joining: dateOfJoining } : r)));
      setEditingStageId(null);
      setDateOfJoining("");
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to save joining date." });
    } finally {
      setSavingStage(false);
    }
  }

  // Adding a candidate to the client shortlist and their pipeline stage are
  // the same real-world event from the client's point of view -- being put
  // in front of the client -- so this keeps stage in sync automatically
  // instead of leaving a recruiter to remember to also flip the Stage
  // dropdown. Only auto-advances (never downgrades someone already further
  // along, e.g. already at client_interview), and only auto-syncs this one
  // direction: manually setting Stage to "submitted" from the dropdown does
  // NOT add someone to the shortlist, since a recruiter might mark that for
  // other reasons (e.g. submitted outside this tool).
  async function syncStageForShortlist(row: MandateCandidateRow, addingToShortlist: boolean) {
    const newStage: Stage = addingToShortlist ? "submitted" : "pulled_back";
    if (addingToShortlist && (STAGE_ORDER[row.stage] ?? 0) >= STAGE_ORDER["submitted"]) return; // already further along, don't downgrade
    if (!addingToShortlist && row.stage === "pulled_back") return; // already pulled back

    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId: mandateContext.mandateId as string,
        candidateName: row.candidate.full_name,
        mandateLabel: `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`,
        previousStage: row.stage,
        newStage,
        source: "recruiter",
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: "recruiter" } : r)));
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to sync stage with shortlist status." });
    }
  }

  async function toggleShortlist(linkId: string, next: boolean) {
    const row = rows.find((r) => r.id === linkId);
    setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: next } : r)));
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: next }).eq("id", linkId);
    if (error) {
      setMessage({ type: "error", text: error.message });
      setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: !next } : r)));
      return;
    }
    if (row) await syncStageForShortlist(row, next);
    router.refresh();
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mt-6 shadow-sm">
      {message && (
        <div className={`px-4 py-2 text-xs font-medium ${message.type === "success" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}
      <div className={selected.size > 0 ? "px-3 pt-3" : ""}>
        <MandateBulkActionsBar
          rows={rows}
          setRows={setRows}
          selected={selected}
          setSelected={setSelected}
          setMessage={setMessage}
          mandateContext={mandateContext as { mandateId: string; role_title: string; client_name: string; [key: string]: unknown }}
        />
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-4 py-2.5 w-8">
              <input
                type="checkbox"
                checked={rows.length > 0 && selected.size === rows.length}
                onChange={toggleAll}
              />
            </th>
            <th className="text-left px-4 py-2.5">Candidate</th>
            <th className="text-left px-4 py-2.5">Resume</th>
            <th className="text-left px-4 py-2.5">Owner</th>
            <th className="text-left px-4 py-2.5">CTC / Notice</th>
            <th className="text-left px-4 py-2.5">Stability</th>
            <th className="text-left px-4 py-2.5">AI Read</th>
            <th className="text-left px-4 py-2.5">Recommendation</th>
            <th className="text-left px-4 py-2.5">Screening</th>
            <th className="text-left px-4 py-2.5">Stage</th>
            <th className="text-left px-4 py-2.5">In client shortlist</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50">
              <td className="px-4 py-3">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <ApplicationAnswersQuickView answers={applicationAnswersByCandidate[l.candidate.id]}>
                    <Link href={`/candidates/${l.candidate.id}?mandateId=${mandateContext.mandateId}`} className="font-medium text-slate-900 dark:text-slate-100 hover:text-blue-600">
                      {l.candidate.full_name}
                    </Link>
                  </ApplicationAnswersQuickView>
                  {l.is_priority && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white"
                      title="Candidate paid to flag this application as priority"
                    >
                      <Zap className="h-2.5 w-2.5" /> Priority
                    </span>
                  )}
                  {l.match_score != null && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${matchScoreTone(l.match_score)}`}
                      title="Match score at the time this candidate was added to the pipeline"
                    >
                      Match {l.match_score}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-400">{l.candidate.sub_domain}</div>
              </td>
              <td className="px-4 py-3">
                {resumeSignedUrlByCandidate[l.candidate.id] ? (
                  <ResumePreview
                    signedUrl={resumeSignedUrlByCandidate[l.candidate.id]}
                    fileName={(l.candidate.resume_file_url ?? `${l.candidate.full_name}-resume`).replace(/^resumes\//, "")}
                    label="Preview"
                  />
                ) : (
                  <span className="text-[11px] text-slate-300">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {isAdmin ? (
                  <select
                    defaultValue={l.candidate.owner_id ?? ""}
                    disabled={reassigningId === l.candidate.id}
                    onChange={(e) => reassignOwner(l.candidate.id, e.target.value)}
                    className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1 bg-white dark:bg-slate-900 max-w-[130px]"
                    title="Admin: reassign this candidate's owner"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name?.trim() || m.email}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-600 dark:text-slate-400 truncate block max-w-[130px]" title="Owner -- this candidate's responsibility">
                    {ownerLabel(l.candidate.owner_id)}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                <div>{l.candidate.current_fixed_ctc ? `₹${l.candidate.current_fixed_ctc}L` : "—"}</div>
                {l.candidate.notice_period && (
                  <div className="text-[10.5px] text-slate-400">Notice: {l.candidate.notice_period}</div>
                )}
              </td>
              <td className="px-4 py-3">
                {l.candidate.stability_score === null || l.candidate.stability_score === undefined ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      generateStabilityScore(l.candidate.id);
                    }}
                    disabled={generatingStability.has(l.candidate.id)}
                    className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300 hover:text-indigo-700 disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
                  >
                    {generatingStability.has(l.candidate.id) ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    {generatingStability.has(l.candidate.id) ? "Generating…" : "Generate"}
                  </button>
                ) : (
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-[10.5px] font-semibold whitespace-nowrap ${stabilityTone(stabilityLabelForScore(l.candidate.stability_score))}`}
                  >
                    {stabilityLabelForScore(l.candidate.stability_score)} · {l.candidate.stability_score}
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <MandateAssessmentPopover
                  assessment={l.match_assessment}
                  onReassess={() => reassessCandidate(l.candidate.id)}
                  reassessing={reassessingIds.has(l.candidate.id)}
                />
              </td>
              <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                {(l.candidate.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => setScreeningRowId(l.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                    l.screened
                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                      : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  }`}
                >
                  <MessageCircleQuestion className="w-3 h-3" />
                  {l.screened ? "Screened" : "Screen"}
                </button>
              </td>
              <td className="px-4 py-3">
                {editingStageId === l.id ? (
                  <div className="flex flex-col gap-1.5 min-w-[160px]">
                    <select
                      defaultValue={l.stage}
                      autoFocus
                      onChange={(e) => {
                        const next = e.target.value as Stage;
                        // Rejecting has its own dedicated modal (who's
                        // rejecting + mandatory reason) instead of this
                        // generic save path -- see MandateRejectModal.
                        if (next === "rejected") {
                          setRejectModalRow(l);
                          return;
                        }
                        saveStage(l, next);
                      }}
                      disabled={savingStage}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                      <input type="checkbox" checked={clientRelayed} onChange={(e) => setClientRelayed(e.target.checked)} />
                      Client told us this
                    </label>
                    <label className="text-[10px] text-slate-400">
                      Joining date (expected or confirmed -- can be set at any stage)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        value={dateOfJoining}
                        onChange={(e) => setDateOfJoining(e.target.value)}
                        className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1 flex-1"
                      />
                      <button
                        onClick={() => saveJoiningDate(l)}
                        disabled={savingStage || !dateOfJoining}
                        className="text-[10.5px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={() => {
                        setEditingStageId(null);
                        setClientRelayed(false);
                        setDateOfJoining("");
                      }}
                      className="text-[11px] text-slate-400 hover:text-slate-600 text-left"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 items-start">
                    <button
                      onClick={() => {
                        setEditingStageId(l.id);
                        setDateOfJoining(l.date_of_joining ?? "");
                      }}
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${STAGE_COLOR[l.stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                    >
                      {l.stage_source && l.stage_source !== "recruiter" && "🔔 "}
                      {l.stage.replace(/_/g, " ")}
                    </button>
                    {/* Pipeline-progress-at-a-glance -- see stage-timeline.tsx for the
                        honest caveat that only the current dot has a real date, since
                        we don't log a full per-transition history. */}
                    <StageTimeline stage={l.stage} stageUpdatedAt={l.stage_updated_at} rejectedFromStage={l.rejected_from_stage} />
                    {l.date_of_joining && (
                      <span className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                        Joining {new Date(l.date_of_joining).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {/* "Where do the answers reflect" -- right here, without
                        opening anything, so a recruiter scanning the pipeline
                        can see at a glance whether a rejection was ours or
                        the client's and why, not just a bare "rejected" badge. */}
                    {l.stage === "rejected" && l.rejection_category && (
                      <span
                        className={`text-[10.5px] font-medium whitespace-nowrap ${l.stage_source === "recruiter" ? "text-indigo-500" : "text-amber-600"}`}
                        title={l.rejection_reason ?? undefined}
                      >
                        {l.stage_source === "recruiter" ? "We passed" : "Client passed"} · {rejectionReasonLabel(l.stage_source as "recruiter" | "client_relayed", l.rejection_category)}
                      </span>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => toggleShortlist(l.id, !l.in_shortlist)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    l.in_shortlist ? "bg-teal-100 text-teal-800 hover:bg-teal-200" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  {l.in_shortlist ? "Yes — click to remove" : "No — click to add"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
          No candidates linked yet. Link candidates from their profile page.
        </p>
      )}

      {screeningRowId && (() => {
        const row = rows.find((r) => r.id === screeningRowId);
        if (!row) return null;
        return (
          <MandateScreeningPanel
            open={true}
            onClose={() => setScreeningRowId(null)}
            candidate={row.candidate}
            mandateContext={mandateContext}
            onSaved={() => {
              setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, screened: true } : r)));
              router.refresh();
            }}
          />
        );
      })()}

      {rejectModalRow && (
        <MandateRejectModal
          candidateName={rejectModalRow.candidate.full_name}
          submitting={rejecting}
          onCancel={() => setRejectModalRow(null)}
          onConfirm={confirmReject}
        />
      )}
    </div>
  );
}
