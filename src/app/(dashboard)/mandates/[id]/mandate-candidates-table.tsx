"use client";

import PipelineWhatsApp from "./pipeline-whatsapp";
import PipelineTemplateActions from "./pipeline-template-actions";
import OriginChip from "./origin-chip";
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type MandateScreeningContext } from "./mandate-screening-panel";
import { STAGES, STAGE_COLOR, applyStageChange, rejectionReasonLabel, type Stage, type StageSource } from "@/lib/mandate-stage";
import MandateRejectModal from "./mandate-reject-modal";
import { ProfileRatingBadge, useProfileRatings } from "@/components/profile-rating";
import ConfirmDetailsModal from "./confirm-details-modal";
import MandateBulkActionsBar from "./mandate-bulk-actions-bar";
import ApplicationAnswersQuickView, { type ApplicationAnswer } from "./application-answers-quick-view";
import ResumePreview from "../../candidates/[id]/resume-preview";
import FlagForCallButton, { type ExistingCallFlag } from "./flag-for-call-button";
import CallDispositionControl from "./call-disposition-control";
import VendorNoteControl from "./vendor-note-control";
import { Zap, Sparkles, Loader2 } from "lucide-react";
import MandateAssessmentPopover from "./mandate-assessment-popover";
import RecommendDialog from "@/components/recommend-dialog";
import { isRecruiterDrivenSource, sourceChannelLabel } from "@/lib/candidate-source-label";

// Stage index used only to decide whether adding to the client shortlist
// should auto-advance stage -- never downgrades a candidate who's already
// further along (e.g. already at client_interview) back to "submitted".
const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});

// Stages where a recruiter often records something the client told them, and where a
// joining date can matter. For every other stage neither question applies, so the
// editor doesn't show them.
const CLIENT_DECISION_STAGES = new Set<string>(["client_interview", "client_shortlisted", "offer", "placed"]);
const JOINING_STAGES = new Set<string>(["offer", "placed"]);

// Same thresholds as the Matching Workspace's scoreColor() -- keeps "what
// counts as a strong match" consistent whether a recruiter is looking at
// the match list or the pipeline table/board.

// A short note for the client, shown on this candidate's card in the client portal once the candidate is shared. Saved on its
// own, so it can be written before or after sharing.
function ClientNoteBox({ linkId, initial, onSaved }: { linkId: string; initial: string | null; onSaved: (note: string | null) => void }) {
  const supabase = createClient();
  const [text, setText] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const dirty = text.trim() !== (initial ?? "").trim();

  async function save() {
    setBusy(true);
    setErr(null);
    const note = text.trim() || null;
    const { error } = await supabase.from("candidate_mandate_links").update({ client_note: note }).eq("id", linkId);
    setBusy(false);
    if (error) setErr(error.message);
    else onSaved(note);
  }

  return (
    <div className="mt-3 w-full">
      <label className="mb-1 block text-[12px] font-medium text-slate-600 dark:text-slate-300">Note for the client</label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1000}
        placeholder="Optional. Shown on this candidate's card in the client portal."
        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="mt-1 flex items-center gap-2">
        <button type="button" onClick={save} disabled={busy || !dirty} className="rounded-lg bg-teal-600 px-3 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-40">
          {busy ? "Saving…" : "Save note"}
        </button>
        {!dirty && initial ? <span className="text-xs text-emerald-700">Saved, client can see it once shared</span> : null}
        {err ? <span className="text-xs text-rose-600">{err}</span> : null}
      </div>
    </div>
  );
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
  call_disposition: string | null;
  call_disposition_note: string | null;
  vendor_update_note: string | null;
  vendor_update_note_at: string | null;
  created_at: string | null;
  // How this person got into the pipeline (applied themselves, added by a recruiter, accepted from an
  // AI suggestion, a vendor, or the older pipeline whose origin was never recorded).
  origin: "applied" | "team" | "ai" | "vendor" | "earlier";
  origin_label: string;
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
  match_bucket: "perfect" | "close" | "stretch" | null;
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
  // Null = nobody on the team has opened this candidate's profile or resume
  // for THIS mandate yet -- shown as an unread/"New" marker. Set once, by
  // whoever opens it first, and never cleared -- a shared team inbox (two
  // recruiters working the same mandate both see the same read state), not
  // a per-user read receipt.
  viewed_at: string | null;
  // Set by the client themselves via the no-login shortlist link (see
  // submit_client_shortlist_feedback RPC / shortlist/[token]/feedback-buttons.tsx)
  // -- "interested" and "not_interested" never touch stage, so without this
  // surfaced somewhere a recruiter had no way to see those two responses at
  // all short of re-opening the client's own link. "interview_requested"
  // also moves stage to client_interview, so this badge is somewhat
  // redundant with the stage badge for that one value, but showing it here
  // too keeps all three responses visually consistent instead of two being
  // invisible and one being a totally different UI element.
  client_feedback: "interested" | "not_interested" | "interview_requested" | null;
  // Why the client passed, as they chose it in the portal (and any note they added).
  client_pass_reason: string | null;
  client_pass_note: string | null;
  // A note from us that the client sees on this candidate's card in the portal.
  client_note: string | null;
  // Ways this not-yet-shared candidate resembles people the client has passed on, worded for the recruiter.
  pass_patterns: string[];
  // The last two jobs, newest first, shown beside the stage so screening needs no extra clicks.
  last_roles: { title: string; company: string | null; period: string }[];
  candidate: {
    id: string;
    full_name: string;
    email: string | null;
    phone?: string | null;
    readiness_missing?: string[] | null;
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
    current_location?: string | null;
    current_job_title?: string | null;
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
    // Overall, candidate-level read -- generated once automatically when the
    // candidate registers (see generateAiPassportForCandidate), NOT
    // mandate-specific. Shown alongside the mandate-specific "AI Read"
    // column so a recruiter can see "who is this person overall" next to
    // "how do they fit THIS role" without leaving the pipeline.
    ai_summary: string | null;
    // How this candidate entered the system + who added them, if
    // recruiter-driven -- see candidate-source-label.ts for the full
    // mapping. created_by_user is set once at insert and never touched
    // by owner reassignment, so it's the true "who uploaded this CV".
    created_by: string | null;
    created_by_user: string | null;
    source: string | null;
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

// One line of "why", cut at two lines; a click shows the whole sentence.
function FitReason({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button type="button" onClick={() => setOpen((v) => !v)} title={open ? "Show less" : "Show the full reason"} className="mt-1 block max-w-[230px] text-left text-[11.5px] leading-4 text-slate-500 hover:text-slate-700 dark:text-slate-400">
      <span className={open ? "" : "line-clamp-2"}>{text}</span>
    </button>
  );
}

export default function MandateCandidatesTable({
  rows: initialRows,
  mandateContext,
  teamMembers = [],
  isAdmin = false,
  applicationAnswersByCandidate = {},
  resumeSignedUrlByCandidate = {},
  flaggedCallByCandidate = {},
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
  flaggedCallByCandidate?: Record<string, { flagId: string; recruiterId: string; recruiterName: string; round: string | null }>;
}) {
  const ownerLabel = (id: string | null) => {
    if (!id) return "Unassigned";
    const m = teamMembers.find((tm) => tm.id === id);
    return m?.full_name?.trim() || m?.email || "Unknown";
  };
  // "Recruiter Added -- Ananta Trivedi" for recruiter/staff-driven entry
  // points (manual add, bulk upload, LinkedIn extension/sourcing); a plain
  // channel label ("Job Application", "Zoho Import", ...) for self-service
  // candidates, where there's no recruiter to attribute the CV to.
  const sourceCellLabel = (c: MandateCandidateRow["candidate"]) => {
    const channel = sourceChannelLabel(c.created_by, c.source);
    if (isRecruiterDrivenSource(c.created_by)) {
      return `${channel} \u2014 ${ownerLabel(c.created_by_user)}`;
    }
    return channel;
  };
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [nowMs] = useState(() => Date.now());
  const [flagMap, setFlagMap] = useState<Record<string, ExistingCallFlag>>(flaggedCallByCandidate);
  // Pick up fresh data from the server IN PLACE. This view used to be torn down and rebuilt
  // whenever new rows arrived, which closed anything open on it (a CV preview, a window) a few
  // seconds after the page loaded, each time background work finished. React's recommended
  // way to follow a changed prop is to adjust state while rendering, not to remount.
  const [seenRows, setSeenRows] = useState(initialRows);
  if (seenRows !== initialRows) {
    setSeenRows(initialRows);
    setRows(initialRows);
  }
  const [seenFlags, setSeenFlags] = useState(flaggedCallByCandidate);
  if (seenFlags !== flaggedCallByCandidate) {
    setSeenFlags(flaggedCallByCandidate);
    setFlagMap(flaggedCallByCandidate);
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Rows opened to show everything else about a person; closed by default so the list stays calm.
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpenRows((prev) => (prev.has(id) ? new Set([...prev].filter((x) => x !== id)) : new Set(prev).add(id)));
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  // Which row is mid-edit on its stage select, and whether that edit is
  // being attributed to the client (vs. the recruiter's own call) --
  // separate from `rows` state since most rows are never being edited.
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [clientRelayed, setClientRelayed] = useState(false);
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [savingStage, setSavingStage] = useState(false);
  const [pickedStage, setPickedStage] = useState<Stage>("sourced");
  // Per-candidate list of what still blocks sharing with the client (empty = ready).
  const [readiness, setReadiness] = useState<Record<string, string[]>>({});
  const [confirmRow, setConfirmRow] = useState<MandateCandidateRow | null>(null);
  const [rejectModalRow, setRejectModalRow] = useState<MandateCandidateRow | null>(null);
  const ratings = useProfileRatings();
  const [rejecting, setRejecting] = useState(false);

  const [reassigningId, setReassigningId] = useState<string | null>(null);
  const [generatingStability, setGeneratingStability] = useState<Set<string>>(new Set());
  const [reassessingIds, setReassessingIds] = useState<Set<string>>(new Set());

  // Marks a candidate's application to this mandate as "opened" -- fired the
  // moment a recruiter previews their resume inline, without waiting for a
  // full profile navigation (opening the profile page marks it too, see
  // candidates/[id]/page.tsx). Team-wide, not per-user: once anyone opens
  // it, it's read for everyone working this mandate. .is("viewed_at", null)
  // makes this a no-op (and avoids an extra write) for rows already read,
  // and local state updates immediately so the "New" badge disappears
  // without waiting on a full row refetch.
  async function markViewed(linkId: string) {
    setRows((prev) => prev.map((r) => (r.id === linkId && !r.viewed_at ? { ...r, viewed_at: new Date().toISOString() } : r)));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("candidate_mandate_links")
      .update({ viewed_at: new Date().toISOString(), viewed_by: user?.id ?? null })
      .eq("id", linkId)
      .is("viewed_at", null);
  }

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
        existingDateOfJoining: row.date_of_joining,
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
      setMessage({ type: "error", text: error.message.replace(/^NOT_CLIENT_READY:\s*/, "") });
      setRows((prev) => prev.map((r) => (r.id === linkId ? { ...r, in_shortlist: !next } : r)));
      return;
    }
    if (row) await syncStageForShortlist(row, next);
    router.refresh();
  }

  // What's still missing before each not-yet-shared candidate can be shown to the
  // client. One call for the whole list; the database enforces the same rule.
  async function refreshReadiness(linkIds?: string[]) {
    const ids = linkIds ?? rows.filter((r) => !r.in_shortlist).map((r) => r.id);
    if (ids.length === 0) return;
    const { data } = await supabase.rpc("client_share_blockers_bulk_links", { p_link_ids: ids });
    if (data && typeof data === "object") setReadiness((prev) => ({ ...prev, ...(data as Record<string, string[]>) }));
  }

  useEffect(() => {
    // Load once on mount: the readiness list comes from the database, not from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The one way to put a candidate in front of the client: shortlist + stage move
  // together. If details are missing, the confirm-details window opens instead.
  async function shareWithClient(row: MandateCandidateRow): Promise<boolean> {
    setMessage(null);
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).eq("id", row.id);
    if (error) {
      if (error.message.includes("NOT_CLIENT_READY")) {
        await refreshReadiness([row.id]);
        setConfirmRow(row);
      } else {
        setMessage({ type: "error", text: error.message });
      }
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, in_shortlist: true } : r)));
    await syncStageForShortlist(row, true);
    setMessage({ type: "success", text: `${row.candidate.full_name} is now visible to the client.` });
    router.refresh();
    return true;
  }

  function handleStagePick(row: MandateCandidateRow, next: Stage) {
    setPickedStage(next);
    if (next === "rejected") {
      setRejectModalRow(row);
      return;
    }
    // "Submitted" and "shared with the client" are the same event: use the share flow.
    if (next === "submitted" && !row.in_shortlist && (STAGE_ORDER[row.stage] ?? 0) < STAGE_ORDER["submitted"]) {
      setEditingStageId(null);
      void shareWithClient(row);
      return;
    }
    // Stages with nothing extra to record save straight away.
    if (!CLIENT_DECISION_STAGES.has(next)) void saveStage(row, next);
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
        <thead className="text-slate-400 text-xs uppercase tracking-wide">
          <tr className="border-b border-slate-100 dark:border-slate-800">
            <th className="px-4 py-2 w-8">
              <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleAll} />
            </th>
            <th className="text-left px-3 py-2 font-medium">Candidate</th>
            <th className="text-left px-3 py-2 font-medium">Fit</th>
            <th className="text-left px-3 py-2 font-medium">Pay · notice</th>
            <th className="text-left px-3 py-2 font-medium">Stage</th>
            <th className="hidden px-3 py-2 text-left font-medium xl:table-cell">Last two roles</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <Fragment key={l.id}>
              <tr className={`group hover:bg-slate-50/70 dark:hover:bg-slate-800/40 ${openRows.has(l.id) ? "bg-slate-50/60 dark:bg-slate-800/30" : ""}`}>
                <td className="px-4 py-3 align-top">
                <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} />
              </td>
                <td className="px-3 py-3 align-top">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ApplicationAnswersQuickView answers={applicationAnswersByCandidate[l.candidate.id]}>
                    <Link
                      target="_blank" rel="noopener noreferrer" href={`/candidates/${l.candidate.id}?mandateId=${mandateContext.mandateId}`}
                      onClick={() => markViewed(l.id)}
                      className={`hover:text-teal-600 ${l.viewed_at ? "font-medium text-slate-900 dark:text-slate-100" : "font-bold text-slate-900 dark:text-slate-100"}`}
                    >
                      {l.candidate.full_name}
                    </Link>
                  </ApplicationAnswersQuickView>
                  <ProfileRatingBadge row={ratings.get(l.candidate.id)} />
                  <OriginChip origin={l.origin} label={l.origin_label} />
                  {!l.viewed_at && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-600 px-1.5 py-0.5 text-xs font-bold text-white"
                      title="Nobody on the team has opened this candidate for this mandate yet"
                    >
                      New
                    </span>
                  )}
                  {l.is_priority && (
                    <span
                      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-teal-600 px-1.5 py-0.5 text-xs font-bold text-white"
                      title="Candidate paid to flag this application as priority"
                    >
                      <Zap className="h-2.5 w-2.5" /> Priority
                    </span>
                  )}
                {resumeSignedUrlByCandidate[l.candidate.id] && (
                  <span className="inline-flex" onClick={(e) => e.stopPropagation()}>
                    <ResumePreview
                      signedUrl={resumeSignedUrlByCandidate[l.candidate.id]}
                      fileName={(l.candidate.resume_file_url ?? `${l.candidate.full_name}-resume`).replace(/^resumes\//, "")}
                      label="CV"
                      candidateId={l.candidate.id}
                      onOpen={() => markViewed(l.id)}
                    />
                  </span>
                )}
                  {/* The old "Match NN" badge was removed: it came from a score that
                      gave almost everyone 76 to 88 and contradicted the evidence-based
                      verdict. Triage and AI Matches show the verdict with its doubts. */}
                </div>
                <div className="text-xs text-slate-400 truncate max-w-[260px]">{[l.candidate.current_job_title, l.candidate.current_employer].filter(Boolean).join(" at ") || l.candidate.sub_domain}</div>
                {l.candidate.current_location && (
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
                    📍 {l.candidate.current_location}
                    {/^(yes|open|willing)/i.test(l.candidate.open_to_relocation ?? "") ? <span className="text-emerald-600 dark:text-emerald-400"> · open to relocate</span> : null}
                  </div>
                )}
              </td>
                <td className="px-3 py-3 align-top">
                <MandateAssessmentPopover
                  assessment={l.match_assessment}
                  onReassess={() => reassessCandidate(l.candidate.id)}
                  reassessing={reassessingIds.has(l.candidate.id)}
                />
                {l.match_assessment && (() => {
                  const a = l.match_assessment;
                  const reason = a.recommendation === "Strong Fit" ? a.positives[0] : a.red_flags[0] ?? a.missing[0];
                  return reason ? <FitReason text={reason} /> : null;
                })()}
              </td>
                <td className="px-3 py-3 align-top text-[13px]"><div className="text-slate-700 dark:text-slate-300 tabular-nums">
                  <span className="whitespace-nowrap">{l.candidate.current_fixed_ctc ? `₹${l.candidate.current_fixed_ctc}L` : "—"}</span>
                  {l.candidate.notice_period ? <span className="block whitespace-nowrap text-slate-400">{l.candidate.notice_period}</span> : null}
                </div></td>
                <td className="px-3 py-3 align-top">
                {editingStageId === l.id ? (
                  <div className="flex flex-col gap-1.5 min-w-[170px]">
                    <select
                      value={pickedStage}
                      autoFocus
                      onChange={(e) => handleStagePick(l, e.target.value as Stage)}
                      disabled={savingStage}
                      className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    {CLIENT_DECISION_STAGES.has(pickedStage) && (
                      <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                        <input type="checkbox" checked={clientRelayed} onChange={(e) => setClientRelayed(e.target.checked)} />
                        The client told us this (outside the portal)
                      </label>
                    )}
                    {JOINING_STAGES.has(pickedStage) && (
                      <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-400">Joining date (expected or confirmed)</label>
                        <input
                          type="date"
                          value={dateOfJoining}
                          onChange={(e) => setDateOfJoining(e.target.value)}
                          className="text-xs rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1"
                        />
                      </div>
                    )}
                    {CLIENT_DECISION_STAGES.has(pickedStage) && pickedStage !== l.stage && (
                      <button
                        onClick={() => saveStage(l, pickedStage)}
                        disabled={savingStage}
                        className="rounded-lg bg-teal-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-500 disabled:opacity-50"
                      >
                        Save stage
                      </button>
                    )}
                    {pickedStage === l.stage && JOINING_STAGES.has(l.stage) && (
                      <button
                        onClick={() => saveJoiningDate(l)}
                        disabled={savingStage || !dateOfJoining}
                        className="text-xs font-medium text-teal-600 hover:text-teal-700 disabled:opacity-40 text-left"
                      >
                        Save joining date
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEditingStageId(null);
                        setClientRelayed(false);
                        setDateOfJoining("");
                      }}
                      className="text-xs text-slate-400 hover:text-slate-600 text-left"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 items-start">
                    <button
                      onClick={() => {
                        setEditingStageId(l.id);
                        setPickedStage(l.stage as Stage);
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
                    {l.stage_updated_at && !["rejected", "pulled_back", "placed"].includes(l.stage) && (() => {
                      const days = Math.max(0, Math.floor((nowMs - new Date(l.stage_updated_at).getTime()) / 86_400_000));
                      const what = l.stage === "submitted" ? "Sent to client" : l.stage === "client_interview" ? "Interview requested" : "In this stage";
                      return (
                        <span className={`text-[11.5px] ${days >= 7 ? "font-medium text-amber-600" : "text-slate-400"}`}>
                          {what} {days === 0 ? "today" : `${days}d ago`}
                        </span>
                      );
                    })()}
                    {/* What the client has done about this candidate in the portal, visible without expanding the row. */}
                    {l.in_shortlist && !["rejected", "pulled_back", "placed"].includes(l.stage) && (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11.5px] font-medium ${
                          l.client_feedback === "interested"
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                            : l.client_feedback === "interview_requested"
                              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"
                              : l.client_feedback === "not_interested"
                                ? "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        }`}
                        title={l.client_feedback === "not_interested" ? [l.client_pass_reason ? rejectionReasonLabel("client_relayed", l.client_pass_reason) : null, l.client_pass_note].filter(Boolean).join(": ") || undefined : undefined}
                      >
                        {l.client_feedback === "interested"
                          ? "Client: interested"
                          : l.client_feedback === "interview_requested"
                            ? "Client: wants interview"
                            : l.client_feedback === "not_interested"
                              ? `Client passed${l.client_pass_reason ? ` · ${(rejectionReasonLabel("client_relayed", l.client_pass_reason) ?? "").replace(/^Client:?\s*/i, "").replace(/^cited /i, "")}` : ""}`
                              : "Client: no response yet"}
                        {l.client_decision_at && l.client_feedback ? ` · ${new Date(l.client_decision_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}` : ""}
                      </span>
                    )}
                    {l.date_of_joining && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium whitespace-nowrap">
                        Joining {new Date(l.date_of_joining).toLocaleDateString(undefined, { timeZone: "Asia/Kolkata", month: "short", day: "numeric" })}
                      </span>
                    )}
                    {/* "Where do the answers reflect" -- right here, without
                        opening anything, so a recruiter scanning the pipeline
                        can see at a glance whether a rejection was ours or
                        the client's and why, not just a bare "rejected" badge. */}
                    {l.stage === "rejected" && l.rejection_category && (
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${l.stage_source === "recruiter" ? "text-teal-500" : "text-amber-600"}`}
                        title={l.rejection_reason ?? undefined}
                      >
                        {l.stage_source === "recruiter" ? "We passed" : "Client passed"} · {rejectionReasonLabel(l.stage_source as "recruiter" | "client_relayed", l.rejection_category)}
                      </span>
                    )}
                  </div>
                )}
              </td>
                <td className="hidden px-3 py-3 align-top xl:table-cell">
                  {l.last_roles.length === 0 ? (
                    <span className="text-xs text-slate-300 dark:text-slate-600">No job history on file</span>
                  ) : (
                    <ul className="max-w-[300px] space-y-1.5">
                      {l.last_roles.map((r, i) => (
                        <li key={i} className="leading-4" title={`${r.title}${r.company ? `, ${r.company}` : ""}${r.period ? ` (${r.period})` : ""}`}>
                          <p className="truncate text-[12.5px] font-medium text-slate-800 dark:text-slate-200">{r.title}</p>
                          <p className="truncate text-[11.5px] text-slate-500 dark:text-slate-400">
                            {r.company ?? "Company not stated"}
                            {r.period ? <span className="text-slate-400 dark:text-slate-500"> · {r.period}</span> : null}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-3 align-top text-right">
                  {!l.in_shortlist && l.pass_patterns.length > 0 && (
                    <span className="mr-2 inline-block max-w-[220px] rounded-full bg-amber-50 px-2.5 py-1 align-middle text-[11.5px] font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" title={l.pass_patterns.join("\n")}>
                      Like past passes: {l.pass_patterns.map((p) => p.split(" (")[0]).join(", ")}
                    </span>
                  )}
                  {!l.in_shortlist && (STAGE_ORDER[l.stage] ?? 0) < STAGE_ORDER["submitted"] && l.stage !== "rejected" && l.stage !== "pulled_back" && (
                    l.match_assessment?.recommendation === "Not a Fit" ? (
                      <button type="button" onClick={() => void shareWithClient(l)} title="The assessment says this is not a fit. Clients are sometimes fine with exceptions." className="mr-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                        Send anyway
                      </button>
                    ) : (
                      <button type="button" onClick={() => void shareWithClient(l)} className="mr-1 rounded-full border border-teal-200 px-2.5 py-1 text-[12px] font-medium text-teal-700 hover:bg-teal-50 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40">
                        Send to client
                      </button>
                    )
                  )}
                  <RecommendDialog
                    candidateId={l.candidate.id}
                    candidateName={l.candidate.full_name ?? "this candidate"}
                    defaultMandateId={mandateContext.mandateId as string}
                    label="Recommend"
                    className="mr-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-500 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950/30"
                  />
                  {!["rejected", "pulled_back", "placed"].includes(l.stage) && (
                    <button type="button" onClick={() => setRejectModalRow(l)} className="mr-1 rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30">
                      Reject
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleOpen(l.id)}
                    aria-expanded={openRows.has(l.id)}
                    className="rounded-full px-2.5 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
                  >
                    {openRows.has(l.id) ? "Close" : "More"}
                  </button>
                </td>
              </tr>
              {openRows.has(l.id) && (
                <tr className="bg-slate-50/60 dark:bg-slate-800/30">
                  <td></td>
                  <td colSpan={6} className="px-3 pb-4 pt-1">
                    <div className="grid items-start gap-4 md:grid-cols-3">
                      <div className="rounded-ros-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Contact and calls</p>
                        <div className="flex flex-col items-start gap-1.5">
                  <PipelineWhatsApp
                    candidateId={l.candidate.id}
                    candidateName={l.candidate.full_name}
                    phone={l.candidate.phone}
                    missing={l.candidate.readiness_missing}
                    stage={l.stage}
                    roleTitle={mandateContext.role_title ?? null}
                    cities={(mandateContext.cities as string[] | undefined) ?? null}
                    workMode={(mandateContext.work_mode as string | null | undefined) ?? null}
                  />
                  <PipelineTemplateActions
                    candidateId={l.candidate.id}
                    mandateId={mandateContext.mandateId}
                    stage={l.stage}
                    missing={l.candidate.readiness_missing}
                    showOpportunity={l.stage === "sourced" || l.stage === "screened"}
                  />
                  <FlagForCallButton
                    candidateId={l.candidate.id}
                    candidateName={l.candidate.full_name}
                    mandateId={mandateContext.mandateId}
                    mandateRoleTitle={mandateContext.role_title ?? null}
                    teamMembers={teamMembers}
                    existingFlag={flagMap[l.candidate.id] ?? null}
                    onFlagged={(flag) => setFlagMap((prev) => ({ ...prev, [l.candidate.id]: flag }))}
                  />
                  <CallDispositionControl
                    linkId={l.id}
                    candidateId={l.candidate.id}
                    candidateName={l.candidate.full_name}
                    mandateId={mandateContext.mandateId}
                    mandateRoleTitle={mandateContext.role_title ?? null}
                    clientName={(mandateContext.client_name as string | undefined) ?? null}
                    currentStage={l.stage}
                    currentDisposition={l.call_disposition}
                    currentNote={l.call_disposition_note ?? null}
                    onApplied={() => router.refresh()}
                  />
                </div>
                      </div>
                      <div className="rounded-ros-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-slate-100">About this candidate</p>
                        <dl className="space-y-3 text-[13px] [&_dd]:mt-0.5">
                          <div><dt className="text-slate-500" title="The team member who looks after this candidate. The recruiter for the role is shown at the top of the page.">Candidate owner</dt><dd>
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
              </dd></div>
                          <div><dt className="text-slate-500">Source</dt><dd>
                <span
                  className="text-xs text-slate-600 dark:text-slate-400 truncate block max-w-[150px]"
                  title={sourceCellLabel(l.candidate)}
                >
                  {sourceCellLabel(l.candidate)}
                </span>
                {l.candidate.created_by === "vendor_submitted" && (
                  <div className="mt-1">
                    <VendorNoteControl linkId={l.id} currentNote={l.vendor_update_note ?? null} />
                  </div>
                )}
              </dd></div>
                          <div><dt className="text-slate-500">Stability</dt><dd>
                {l.candidate.stability_score === null || l.candidate.stability_score === undefined ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      generateStabilityScore(l.candidate.id);
                    }}
                    disabled={generatingStability.has(l.candidate.id)}
                    className="flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-300 hover:text-teal-700 disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
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
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${stabilityTone(stabilityLabelForScore(l.candidate.stability_score))}`}
                  >
                    {stabilityLabelForScore(l.candidate.stability_score)} · {l.candidate.stability_score}
                  </span>
                )}
              </dd></div>
                          <div><dt className="text-slate-500">Recruiter view</dt><dd>
                {(l.candidate.recruiter_assessment?.["overall_recommendation"] as string) ?? "Not assessed"}
              </dd></div>
                        </dl>
                      </div>
                      <div className="rounded-ros-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                        <p className="mb-3 text-[13px] font-semibold text-slate-900 dark:text-slate-100">With the client</p>
                        
                <div className="flex flex-col items-start gap-1">
                  {(() => {
                    if (l.in_shortlist) {
                      return (
                        <>
                          <span className="inline-flex rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800">Shared with client</span>
                          <button onClick={() => toggleShortlist(l.id, false)} className="text-xs text-slate-400 underline hover:text-slate-600">
                            Pull back
                          </button>
                        </>
                      );
                    }
                    const missing = readiness[l.id];
                    if (missing === undefined) return <span className="text-xs text-slate-400">Checking…</span>;
                    if (missing.length === 0) {
                      return (
                        <>
                          <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Ready to share</span>
                          <button onClick={() => shareWithClient(l)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-500">
                            Share with client
                          </button>
                        </>
                      );
                    }
                    return (
                      <>
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700" title={missing.join(", ")}>
                          {missing.length} to confirm
                        </span>
                        <button onClick={() => setConfirmRow(l)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                          Confirm details
                        </button>
                      </>
                    );
                  })()}
                  {/* Client's own click on the shortlist link -- see the
                      client_feedback field comment on MandateCandidateRow
                      above for why this needed its own badge. */}
                  {l.client_feedback && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        l.client_feedback === "interested"
                          ? "bg-emerald-100 text-emerald-800"
                          : l.client_feedback === "interview_requested"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {l.client_feedback === "interested"
                        ? "Client: Interested"
                        : l.client_feedback === "interview_requested"
                          ? "Client: Wants interview"
                          : "Client: Not interested"}
                    </span>
                  )}
                  {l.client_feedback === "not_interested" && l.client_pass_reason && (
                    <span className="max-w-[170px] text-xs leading-4 text-slate-500" title={l.client_pass_note ?? undefined}>
                      {rejectionReasonLabel("client_relayed", l.client_pass_reason)}
                      {l.client_pass_note ? `: ${l.client_pass_note}` : ""}
                    </span>
                  )}
                </div>
                <ClientNoteBox
                  linkId={l.id}
                  initial={l.client_note}
                  onSaved={(note) => setRows((prev) => prev.map((r) => (r.id === l.id ? { ...r, client_note: note } : r)))}
                />
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-10">
          No candidates linked yet. Link candidates from their profile page.
        </p>
      )}


      {confirmRow && (
        <ConfirmDetailsModal
          linkId={confirmRow.id}
          mandateId={mandateContext.mandateId as string}
          candidateId={confirmRow.candidate.id}
          candidateName={confirmRow.candidate.full_name}
          blockers={readiness[confirmRow.id] ?? []}
          onRecheck={() => refreshReadiness([confirmRow.id])}
          onShare={() => shareWithClient(confirmRow)}
          onClose={() => setConfirmRow(null)}
        />
      )}

      {rejectModalRow && (
        <MandateRejectModal
          candidateName={rejectModalRow.candidate.full_name}
          candidateId={rejectModalRow.candidate.id}
          mandateId={mandateContext.mandateId as string}
          submitting={rejecting}
          onCancel={() => setRejectModalRow(null)}
          onConfirm={confirmReject}
        />
      )}
    </div>
  );
}
