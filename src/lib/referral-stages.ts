// The journey a referred candidate follows, in order, with plain labels a
// referrer understands. Ended states sit outside the line.

export const REFERRAL_STAGES: { key: string; label: string; hint: string }[] = [
  { key: "submitted", label: "Submitted", hint: "We have your referral" },
  { key: "screened", label: "Screened", hint: "Our recruiter has reviewed them" },
  { key: "candidate_interested", label: "Interested", hint: "The candidate wants to go ahead" },
  { key: "submitted_to_client", label: "With client", hint: "Their profile is with the client" },
  { key: "interviewing", label: "Interviewing", hint: "Interviews are underway" },
  { key: "offered", label: "Offered", hint: "An offer has been made" },
  { key: "joined", label: "Joined", hint: "They have joined the company" },
  { key: "ninety_days_completed", label: "90 days", hint: "They completed 90 days" },
  { key: "payment_received", label: "Client paid", hint: "The client's payment reached us" },
  { key: "payout_processed", label: "Paid out", hint: "Your payout has been processed" },
];

export const ENDED_STATUS: Record<string, string> = {
  not_suitable: "Not suitable for this role",
  candidate_declined: "The candidate declined",
  dropped_out: "The candidate dropped out",
  left_before_90_days: "Left before completing 90 days",
};

export const STAGE_LABEL: Record<string, string> = {
  ...Object.fromEntries(REFERRAL_STAGES.map((s) => [s.key, s.label])),
  not_suitable: "Not suitable",
  candidate_declined: "Declined",
  dropped_out: "Dropped out",
  left_before_90_days: "Left early",
};

export const stageIndex = (status: string) => REFERRAL_STAGES.findIndex((s) => s.key === status);
export const isEnded = (status: string) => status in ENDED_STATUS;
export const isJoinedOrBeyond = (status: string) => stageIndex(status) >= stageIndex("joined");

export type ReferralGroup = "progress" | "joined" | "ended";
export function referralGroup(status: string): ReferralGroup {
  if (isEnded(status)) return "ended";
  return isJoinedOrBeyond(status) ? "joined" : "progress";
}
