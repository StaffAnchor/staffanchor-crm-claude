import type { SupabaseClient } from "@supabase/supabase-js";

// The Time-Saved Ledger. Every time an existing automation does something a
// recruiter would otherwise have done by hand, it writes one row here. The
// point isn't the individual row -- it's that after months of shipping
// "automation" features with nobody ever measuring whether they actually
// saved anyone time, this is the one place that turns "should save time" into
// a number you can look at. See the Reports > Time Saved tab for the rollup.
//
// ESTIMATED_MINUTES below are deliberately conservative, named estimates (not
// measured) -- each one is commented with the manual task it stands in for,
// so anyone auditing the ledger later can see exactly what assumption
// produced the total, and revise it if it's wrong. This is an estimate
// ledger, not a stopwatch; treat totals as "roughly this many recruiter
// minutes not spent on manual admin," not an exact accounting.
export type TimeSavedActionType =
  | "auto_stage_progression" // client acted via portal/shortlist link -- recruiter didn't have to manually update the stage + notify the team
  | "call_summary_draft" // AI turned a screening call's free-text answers into a permanent, searchable summary
  | "duplicate_detected"; // bulk CV upload caught a duplicate before a recruiter re-keyed an existing candidate

export const ACTION_LABELS: Record<TimeSavedActionType, string> = {
  auto_stage_progression: "Auto stage update (client-initiated)",
  call_summary_draft: "AI call/interview summary",
  duplicate_detected: "Duplicate caught at intake",
};

// Conservative, named estimates -- see comment above. Revise here if real
// measurement (e.g. a "how long would this have taken you" prompt) ever
// produces a better number; every consumer reads from this one place.
export const ESTIMATED_MINUTES: Record<TimeSavedActionType, number> = {
  auto_stage_progression: 3, // manual stage update + drafting/sending a status ping to the team
  call_summary_draft: 7, // manually writing up call notes into a reusable summary
  duplicate_detected: 4, // time wasted re-creating and then untangling a duplicate candidate record
};

export async function logTimeSaved(
  supabase: SupabaseClient,
  params: {
    actionType: TimeSavedActionType;
    recruiterId: string | null;
    entityType?: "mandate" | "candidate" | "candidate_mandate_link";
    entityId?: string | null;
    metadata?: Record<string, unknown>;
    minutesOverride?: number;
  }
) {
  try {
    await supabase.from("time_saved_events").insert({
      action_type: params.actionType,
      recruiter_id: params.recruiterId,
      estimated_minutes_saved: params.minutesOverride ?? ESTIMATED_MINUTES[params.actionType],
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Best-effort only -- a failed ledger write should never break the
    // actual automation it's trying to measure.
  }
}
