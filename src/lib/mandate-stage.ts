import type { SupabaseClient } from "@supabase/supabase-js";

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
    dateOfJoining?: string | null;
  }
) {
  const isClientAttributed = params.source !== "recruiter";
  const nowIso = new Date().toISOString();

  const update: Record<string, unknown> = {
    stage: params.newStage,
    stage_updated_at: nowIso,
    stage_source: params.source,
  };
  if (isClientAttributed) update.client_decision_at = nowIso;
  if (params.newStage === "rejected") {
    update.rejected_from_stage = params.previousStage;
    if (params.rejectionReason) update.rejection_reason = params.rejectionReason;
  }
  if (params.newStage === "placed" && params.dateOfJoining) {
    update.date_of_joining = params.dateOfJoining;
  }

  const { error } = await supabase.from("candidate_mandate_links").update(update).eq("id", params.linkId);
  if (error) throw error;

  if (!isClientAttributed) return;

  const { data: assignments } = await supabase
    .from("mandate_assignments")
    .select("freelancer_id")
    .eq("mandate_id", params.mandateId);

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
