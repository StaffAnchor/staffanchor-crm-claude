import type { SupabaseClient } from "@supabase/supabase-js";
import { applyStageChange } from "@/lib/mandate-stage";

// Taking someone back from the client. The client portal lists everyone flagged in_shortlist, whatever their stage, so
// moving the stage to "pulled back" alone leaves the person on the client's screen marked "Withdrawn". A real pull-back
// switches the flag off first (that is what hides them), then records the stage so the history and reports stay right.
export async function pullBackFromClient(
  supabase: SupabaseClient,
  p: { linkId: string; candidateId: string; mandateId: string; candidateName: string; mandateLabel: string; stage: string; existingDateOfJoining?: string | null },
): Promise<void> {
  const { data, error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: false }).eq("id", p.linkId).select("id");
  if (error) throw new Error(`Couldn't take ${p.candidateName} off the client's view: ${error.message}`);
  if (!data || data.length === 0) throw new Error(`You don't have permission to change ${p.candidateName} on this role.`);
  if (p.stage !== "pulled_back") {
    await applyStageChange(supabase, {
      linkId: p.linkId,
      candidateId: p.candidateId,
      mandateId: p.mandateId,
      candidateName: p.candidateName,
      mandateLabel: p.mandateLabel,
      previousStage: p.stage,
      newStage: "pulled_back",
      source: "recruiter",
      existingDateOfJoining: p.existingDateOfJoining ?? null,
    });
  }
}

/** Stages from which a pull-back makes sense. An offer or a placement is a different conversation. */
export const CAN_PULL_BACK = ["submitted", "shortlisted", "client_interview", "client_shortlisted", "pulled_back"];
