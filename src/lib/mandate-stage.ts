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
