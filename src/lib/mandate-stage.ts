import type { SupabaseClient } from "@supabase/supabase-js";
import { logTimeSaved } from "./time-saved";

// Every stage a candidate can be at on ONE specific mandate. Deliberately
// NOT the same list as candidates.status (see status-control.tsx) --
// pipeline progress only ever makes sense in the context of a specific
// mandate, since the same candidate can be at completely different stages
// on two different mandates at once. This is the single source of truth
// the Interviews page, mandate pages, and candidate profile all read from.
export const STAGES = [
  "sourced",
  "screened",
  "shortlisted", // recruiter's own internal pre-submission judgment call
  "submitted",
  "client_interview",
  "client_shortlisted", // client said yes-in-principle after interviewing, before a formal offer
  "offer",
  "placed",
  "pulled_back", // was on the client shortlist, then taken off it before any client decision -- distinct from "rejected" (rejected implies the client/recruiter made a negative call; pulled back just means it's no longer in front of the client)
  "rejected",
] as const;
export type Stage = (typeof STAGES)[number];

// Shared stage-badge color map -- single source of truth for how a stage
// renders as a pill, so the mandate pipeline table, the "Calls flagged"
// header bell, and the admin Team Calls panel all show the exact same
// color for e.g. "client_interview" instead of each guessing their own.
export const STAGE_COLOR: Record<string, string> = {
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

// The two terminal outcomes that mean a candidate is no longer an active
// consideration for a mandate -- see the STAGES comment above for why
// these are distinct from each other, but for "is this still pending"
// purposes (header bell, Team Calls panel) they're treated the same way.
export function isDisposedStage(stage: string | null | undefined): boolean {
  return stage === "rejected" || stage === "pulled_back";
}

export function stageLabel(stage: string): string {
  return stage.replace(/_/g, " ");
}

export type StageSource = "recruiter" | "client_relayed" | "client_portal" | "client_shortlist_link";

const SOURCE_LABEL: Record<StageSource, string> = {
  recruiter: "Recruiter",
  client_relayed: "Client (relayed by recruiter)",
  client_portal: "Client (via portal)",
  client_shortlist_link: "Client (via shortlist link)",
};

// Two deliberately separate, short lists -- the whole point of splitting
// "Rejected" into "We're passing" vs "Client passed" is that these should
// never be confusable, and a recruiter picking a reason should only ever
// see the list that's actually true for who made the call. Codes are
// snake_case so they're stable to group by even if the label text changes.
export const RECRUITER_REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "skills_mismatch", label: "Skills/experience mismatch" },
  { value: "salary_mismatch", label: "Salary expectation mismatch" },
  { value: "location_mismatch", label: "Location/work-mode mismatch" },
  { value: "culture_fit", label: "Culture/team fit concern" },
  { value: "better_candidate_found", label: "Better candidate found for this mandate" },
  { value: "unresponsive", label: "Unresponsive / withdrew" },
  { value: "duplicate_or_ineligible", label: "Duplicate profile or ineligible" },
  // The two auto-filled when a flagged call is closed out as
  // not_recommended_2nd_round / not_interested (see applyCallDisposition
  // below) -- kept in this same list rather than a separate one so
  // rejection reporting (Reports' "Rejection reasons" card) sees them
  // alongside every other recruiter-attributed reason, not off to the side.
  { value: "call_not_recommended", label: "Not recommended after call" },
  { value: "candidate_declined_after_call", label: "Candidate declined after call" },
  { value: "not_selected_after_2nd_round", label: "Not selected after 2nd round call" },
  { value: "other_internal", label: "Other" },
];

export const CLIENT_REJECTION_REASONS: { value: string; label: string }[] = [
  { value: "client_skills_gap", label: "Client cited a skills gap" },
  { value: "client_salary", label: "Client cited salary/budget" },
  { value: "client_culture_fit", label: "Client cited culture/team fit" },
  { value: "role_paused_or_closed", label: "Role paused or closed" },
  { value: "lost_to_other_candidate", label: "Client chose another candidate" },
  { value: "lost_to_other_agency", label: "Lost to another agency/source" },
  { value: "no_client_feedback", label: "Client passed, no reason given" },
  { value: "other_client", label: "Other" },
];

export function rejectionReasonLabel(source: StageSource, category: string | null): string | null {
  if (!category) return null;
  const list = source === "recruiter" ? RECRUITER_REJECTION_REASONS : CLIENT_REJECTION_REASONS;
  return list.find((r) => r.value === category)?.label ?? category;
}

// Applies a stage change to one candidate_mandate_links row, and -- this is
// the actual fix for the bug where changing a candidate's status told
// nobody which mandate it was for and nothing downstream noticed -- when
// the change is attributed to the client (whether they did it themselves
// via a self-service surface, or a recruiter is relaying a call/email),
// fires an immediate, clearly-labeled alert to every recruiter/vendor
// staffed on that mandate via the exact same recruiter_inbox +
// notifications tables the rest of the CRM already uses, so nobody has to
// notice a quiet badge change to know the client just acted.
export async function applyStageChange(
  supabase: SupabaseClient,
  params: {
    linkId: string;
    candidateId: string;
    mandateId: string;
    candidateName: string;
    mandateLabel: string; // e.g. "Enterprise AE — Acme Corp"
    previousStage: string;
    newStage: Stage;
    source: StageSource;
    rejectionReason?: string | null;
    // Short reason code (e.g. "skills_mismatch", "client_budget_cut") --
    // see RECRUITER_REJECTION_REASONS/CLIENT_REJECTION_REASONS below for
    // the two scoped lists a caller should be choosing from depending on
    // `source`. Kept separate from the free-text rejectionReason so
    // rejections can actually be grouped/reported on (see Reports'
    // "Rejection reasons" card) instead of only ever read one at a time.
    rejectionCategory?: string | null;
    dateOfJoining?: string | null;
    // The link's current date_of_joining, if any, from before this call --
    // needed because dateOfJoining above is only the NEW value a caller is
    // trying to set this time (often blank, e.g. a stage change that isn't
    // touching the date). Without this, the mandatory-DOJ check below would
    // wrongly block re-saving an already-placed candidate whose date was
    // set on a previous save.
    existingDateOfJoining?: string | null;
  }
) {
  const isClientAttributed = params.source !== "recruiter";
  const nowIso = new Date().toISOString();

  // A rejection with no reason at all is exactly the gap that made it
  // impossible to tell "we passed on skills" from "client passed on
  // budget" after the fact, or to build any reporting on why candidates
  // are actually falling out of pipelines -- enforced here, at the single
  // shared write path, rather than per-UI, so every caller (table, board,
  // candidate profile, bulk actions, anything added later) gets the same
  // guarantee instead of relying on each surface remembering to ask.
  if (params.newStage === "rejected" && !params.rejectionCategory) {
    throw new Error("A reason is required to reject a candidate.");
  }

  // Placements table (the "source of truth" for who's placed, joining
  // dates, and downstream billing) is only as good as the joining date
  // being on file -- a DB-level CHECK constraint backs this up too, but
  // that raises an opaque Postgres error, so this catches it early with a
  // message a recruiter can actually act on.
  if (params.newStage === "placed" && !(params.dateOfJoining || params.existingDateOfJoining)) {
    throw new Error("A joining date is required to mark a candidate as Placed.");
  }

  const update: Record<string, unknown> = {
    stage: params.newStage,
    stage_updated_at: nowIso,
    stage_source: params.source,
  };
  if (isClientAttributed) update.client_decision_at = nowIso;
  if (params.newStage === "rejected") {
    update.rejected_from_stage = params.previousStage;
    update.rejection_category = params.rejectionCategory;
    if (params.rejectionReason) update.rejection_reason = params.rejectionReason;
  }
  // Previously only saved when advancing to "placed" -- but a client often
  // confirms a joining date at Offer stage, well before the recruiter is
  // ready to formally mark someone Placed, and that date is exactly the
  // thing worth capturing immediately for follow-up. Save it whenever
  // it's provided, regardless of which stage this transition is to.
  if (params.dateOfJoining) {
    update.date_of_joining = params.dateOfJoining;
  }

  const { error } = await supabase.from("candidate_mandate_links").update(update).eq("id", params.linkId);
  if (error) throw error;

  if (!isClientAttributed) return;

  const { data: assignments } = await supabase
    .from("mandate_assignments")
    .select("freelancer_id")
    .eq("mandate_id", params.mandateId);

  // Client acted directly (portal or shortlist link) instead of a recruiter
  // manually updating the stage and pinging the team -- log it against every
  // recruiter/vendor staffed on this mandate, since the time saved (skipping
  // a manual update + status ping) accrues to all of them, not just one.
  for (const a of assignments ?? []) {
    await logTimeSaved(supabase, {
      actionType: "auto_stage_progression",
      recruiterId: a.freelancer_id,
      entityType: "candidate_mandate_link",
      entityId: params.linkId,
      metadata: { newStage: params.newStage, source: params.source },
    });
  }

  const verb = params.newStage.replace(/_/g, " ");
  const title = `${SOURCE_LABEL[params.source]}: ${params.candidateName} → ${verb} — ${params.mandateLabel}`;

  for (const a of assignments ?? []) {
    await supabase.from("recruiter_inbox").insert({
      recruiter_id: a.freelancer_id,
      candidate_id: params.candidateId,
      mandate_id: params.mandateId,
      task_type: "CLIENT_STAGE_UPDATE",
      title,
      priority: "high",
    });
    await supabase.rpc("_create_notification", {
      p_user_id: a.freelancer_id,
      p_type: "client_stage_update",
      p_title: title,
      p_body: null,
      p_link: `/candidates/${params.candidateId}`,
    });
  }
}

// 90-day-from-joining tracker (placed stage only) -- pure display helper,
// no side effects.
export function joiningProgress(dateOfJoining: string | null | undefined): { day: number; done: boolean } | null {
  if (!dateOfJoining) return null;
  const start = new Date(dateOfJoining).getTime();
  const day = Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24));
  return { day: Math.max(0, day), done: day >= 90 };
}

// Shared stage ordering -- used only to decide whether an automatic
// advance (e.g. a "Recommended for 2nd round" call disposition) should
// actually move a candidate forward, or leave them alone because they're
// already further along than the disposition would put them. Never used
// to *downgrade* a candidate.
export const STAGE_ORDER: Record<string, number> = STAGES.reduce((acc, s, i) => ({ ...acc, [s]: i }), {});

export type CallDisposition = "recommended_2nd_round" | "not_recommended_2nd_round" | "not_picked_up" | "not_interested";

export const CALL_DISPOSITIONS: { value: CallDisposition; label: string }[] = [
  { value: "recommended_2nd_round", label: "Recommended for 2nd round" },
  { value: "not_recommended_2nd_round", label: "Not recommended for 2nd round" },
  { value: "not_picked_up", label: "Not picked up / unreachable" },
  { value: "not_interested", label: "Not interested / declined" },
];

export const CALL_DISPOSITION_COLOR: Record<CallDisposition, string> = {
  recommended_2nd_round: "bg-emerald-100 text-emerald-800",
  not_recommended_2nd_round: "bg-rose-100 text-rose-700",
  not_picked_up: "bg-amber-100 text-amber-800",
  not_interested: "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
};

export function callDispositionLabel(d: string | null | undefined): string | null {
  return CALL_DISPOSITIONS.find((c) => c.value === d)?.label ?? null;
}

// A 2nd/final round call is a genuinely different decision from the
// recruiter's original call_disposition above -- "recommended for 2nd
// round" is meaningless once someone's already IN round 2. Kept as a
// fully separate column/type/write-path (applySecondRoundOutcome below)
// rather than overloading call_disposition, which is also DB
// CHECK-constrained to the original 4 values and would reject these.
export type SecondRoundOutcome = "proceed_further" | "rejected_by_us" | "not_picked_up";

export const SECOND_ROUND_OUTCOMES: { value: SecondRoundOutcome; label: string }[] = [
  { value: "proceed_further", label: "Proceed further" },
  { value: "rejected_by_us", label: "Reject" },
  { value: "not_picked_up", label: "Not picked up / unreachable" },
];

export const SECOND_ROUND_OUTCOME_COLOR: Record<SecondRoundOutcome, string> = {
  proceed_further: "bg-emerald-100 text-emerald-800",
  rejected_by_us: "bg-rose-100 text-rose-700",
  not_picked_up: "bg-amber-100 text-amber-800",
};

export function secondRoundOutcomeLabel(o: string | null | undefined): string | null {
  return SECOND_ROUND_OUTCOMES.find((c) => c.value === o)?.label ?? null;
}

// The write path for closing out a 2nd/final round call. Per the agreed
// mapping:
// - proceed_further: the candidate is genuinely moving forward on our own
//   judgment (not the client's -- source stays "recruiter" so this never
//   fires a client-facing notification), so stage advances forward-only to
//   "shortlisted" -- literally defined in STAGES above as "recruiter's own
//   internal pre-submission judgment call", which is exactly what this is.
//   The original recruiter (below) picks it up from there.
// - rejected_by_us: rejects via the same applyStageChange every other
//   rejection uses, source="recruiter" so Reports/the candidate profile
//   correctly show this as an internal call, never a client one, with its
//   own rejection_category so it's distinguishable from every other
//   recruiter-attributed reason.
// - not_picked_up: no stage change -- same "not an outcome yet" logic as
//   the original call_disposition.
//
// Every branch (including not_picked_up -- the recruiter should hear "still
// haven't reached them" too, not just the two terminal outcomes) notifies
// whoever originally flagged this candidate for a 2nd round, i.e. the
// recruiter recorded in call_disposition_by when they set
// recommended_2nd_round (see createSecondRoundFlags below) -- read fresh
// from the row here rather than threaded through as a prop, so this stays
// correct even if the UI never had that value loaded.
export async function applySecondRoundOutcome(
  supabase: SupabaseClient,
  params: {
    linkId: string;
    candidateId: string;
    mandateId: string;
    candidateName: string;
    mandateLabel: string;
    currentStage: string;
    outcome: SecondRoundOutcome;
    actorId: string;
    // Optional free-text reason -- e.g. "spoke to him, comp expectation is
    // way above budget" -- so the recruiter who gets notified of the
    // outcome (and any admin reviewing /calls-flagged later) sees *why*,
    // not just the outcome label.
    note?: string;
  }
) {
  const nowIso = new Date().toISOString();

  const { data: link } = await supabase
    .from("candidate_mandate_links")
    .select("call_disposition_by")
    .eq("id", params.linkId)
    .single();
  const originalRecruiterId = link?.call_disposition_by as string | null | undefined;

  const { error: outcomeError } = await supabase
    .from("candidate_mandate_links")
    .update({
      second_round_outcome: params.outcome,
      second_round_outcome_at: nowIso,
      second_round_outcome_by: params.actorId,
      second_round_outcome_note: params.note?.trim() || null,
    })
    .eq("id", params.linkId);
  if (outcomeError) throw outcomeError;

  if (params.outcome === "proceed_further") {
    if (STAGE_ORDER[params.currentStage] < STAGE_ORDER["shortlisted"]) {
      await applyStageChange(supabase, {
        linkId: params.linkId,
        candidateId: params.candidateId,
        mandateId: params.mandateId,
        candidateName: params.candidateName,
        mandateLabel: params.mandateLabel,
        previousStage: params.currentStage,
        newStage: "shortlisted",
        source: "recruiter",
      });
    }
  } else if (params.outcome === "rejected_by_us") {
    await applyStageChange(supabase, {
      linkId: params.linkId,
      candidateId: params.candidateId,
      mandateId: params.mandateId,
      candidateName: params.candidateName,
      mandateLabel: params.mandateLabel,
      previousStage: params.currentStage,
      newStage: "rejected",
      source: "recruiter",
      rejectionCategory: "not_selected_after_2nd_round",
    });
  }
  // not_picked_up: outcome recorded above, no stage change.

  if (originalRecruiterId && originalRecruiterId !== params.actorId) {
    const outcomeLabel = secondRoundOutcomeLabel(params.outcome) ?? params.outcome;
    const title = `2nd round outcome: ${params.candidateName} → ${outcomeLabel} — ${params.mandateLabel}`;
    await supabase.from("recruiter_inbox").insert({
      recruiter_id: originalRecruiterId,
      candidate_id: params.candidateId,
      mandate_id: params.mandateId,
      task_type: "SECOND_ROUND_OUTCOME",
      title,
      detail: params.note?.trim() || null,
      priority: "normal",
    });
    await supabase.rpc("_create_notification", {
      p_user_id: originalRecruiterId,
      p_type: "second_round_outcome",
      p_title: title,
      p_body: null,
      p_link: `/candidates/${params.candidateId}`,
    });
  }
}

// The single write path for closing out a flagged call with an outcome --
// used identically from the mandate Table/Board (CallDispositionControl
// next to FlagForCallButton) and from the cross-mandate /calls-flagged
// page, so a disposition means the same thing and has the same side
// effect no matter where it's set from (the "symmetry" the two surfaces
// are meant to have).
//
// Stage side effects, per the agreed mapping:
// - recommended_2nd_round: advances stage to "screened" -- deliberately
//   NOT "client_interview": the 2nd round this triggers is an internal
//   round (an admin/manager, not the client), so the stage should only
//   reflect that the recruiter's own screen is done, not that the client
//   is involved yet. Forward-only (STAGE_ORDER guard), so a candidate
//   already past Screened is never pulled backward by a stray
//   disposition -- for most candidates by this point that makes this a
//   no-op on stage, which is fine, the real effect is the routing below.
//   Also creates a fresh CANDIDATE_CALL_REQUEST (call_round=2nd) for
//   every user in call_second_round_routing (see createSecondRoundFlags
//   below) -- the actual "lands on an admin/manager's desk" part.
// - not_recommended_2nd_round / not_interested: rejects the candidate on
//   this mandate via the same applyStageChange() every other rejection
//   path uses (client notifications, rejected_from_stage, etc. all still
//   fire), with a disposition-specific rejection_category so Reports'
//   rejection-reason breakdown can tell these apart from a manual reject.
// - not_picked_up: no stage change at all -- it isn't a real outcome yet,
//   just "try again."
export async function applyCallDisposition(
  supabase: SupabaseClient,
  params: {
    linkId: string;
    candidateId: string;
    mandateId: string;
    candidateName: string;
    mandateLabel: string;
    currentStage: string;
    disposition: CallDisposition;
    actorId: string;
    // Optional free-text reason, same purpose as applySecondRoundOutcome's
    // note above -- lets whoever set this disposition record *why*, e.g.
    // "not picked up after 3 attempts" or "asked for time, will follow up
    // Friday", visible to whoever reviews the flag later.
    note?: string;
  }
) {
  const nowIso = new Date().toISOString();
  const { error: dispositionError } = await supabase
    .from("candidate_mandate_links")
    .update({
      call_disposition: params.disposition,
      call_disposition_at: nowIso,
      call_disposition_by: params.actorId,
      call_disposition_note: params.note?.trim() || null,
    })
    .eq("id", params.linkId);
  if (dispositionError) throw dispositionError;

  if (params.disposition === "recommended_2nd_round") {
    if (STAGE_ORDER[params.currentStage] < STAGE_ORDER["screened"]) {
      await applyStageChange(supabase, {
        linkId: params.linkId,
        candidateId: params.candidateId,
        mandateId: params.mandateId,
        candidateName: params.candidateName,
        mandateLabel: params.mandateLabel,
        previousStage: params.currentStage,
        newStage: "screened",
        source: "recruiter",
      });
    }
    await createSecondRoundFlags(supabase, params);
    return;
  }

  if (params.disposition === "not_recommended_2nd_round" || params.disposition === "not_interested") {
    await applyStageChange(supabase, {
      linkId: params.linkId,
      candidateId: params.candidateId,
      mandateId: params.mandateId,
      candidateName: params.candidateName,
      mandateLabel: params.mandateLabel,
      previousStage: params.currentStage,
      newStage: "rejected",
      source: "recruiter",
      rejectionCategory: params.disposition === "not_interested" ? "candidate_declined_after_call" : "call_not_recommended",
    });
  }
  // not_picked_up: disposition recorded above, no stage change.
}

// The actual "lands on an admin/manager's desk" half of recommended_2nd_
// round -- creates a normal CANDIDATE_CALL_REQUEST (same table/shape
// FlagForCallButton inserts, see flag-for-call-button.tsx) for every user
// in call_second_round_routing, so each of them sees it exactly where
// they already look for flagged calls: the header bell, /calls-flagged,
// My Desk. Skips anyone who already has an open flag for this same
// candidate+mandate rather than piling up duplicates if a recruiter
// somehow re-runs the disposition.
async function createSecondRoundFlags(
  supabase: SupabaseClient,
  params: { candidateId: string; mandateId: string; candidateName: string; mandateLabel: string }
) {
  const { data: recipients } = await supabase.from("call_second_round_routing").select("user_id");
  if (!recipients || recipients.length === 0) return;

  const { data: existingOpen } = await supabase
    .from("recruiter_inbox")
    .select("recruiter_id")
    .eq("candidate_id", params.candidateId)
    .eq("mandate_id", params.mandateId)
    .eq("task_type", "CANDIDATE_CALL_REQUEST")
    .eq("status", "open");
  const alreadyFlagged = new Set((existingOpen ?? []).map((r) => r.recruiter_id));

  const toInsert = recipients
    .filter((r) => !alreadyFlagged.has(r.user_id))
    .map((r) => ({
      task_type: "CANDIDATE_CALL_REQUEST",
      candidate_id: params.candidateId,
      mandate_id: params.mandateId,
      recruiter_id: r.user_id,
      priority: "high",
      call_round: "2nd",
      title: `Call ${params.candidateName} — ${params.mandateLabel} (2nd Round)`,
      detail: `Recommended for a 2nd round after the first call -- please set up the 2nd round call.`,
    }));
  if (toInsert.length > 0) {
    await supabase.from("recruiter_inbox").insert(toInsert);
  }
}
