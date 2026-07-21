// Shared submission-funnel math for the Clients module.
// A candidate's `stage` on candidate_mandate_links is treated as an ordinal
// pipeline position. "Reached X" = current stage rank >= rank(X), i.e. we
// count candidates currently at or past a stage (rejects are tracked
// separately since we don't know which stage they dropped out of).

// FIX (Reports v2 audit): this list previously omitted "client_shortlisted"
// -- a real value candidate_mandate_links.stage can hold (client said
// yes-in-principle after interviewing, before a formal offer). Since RANK
// is built purely from this array, any candidate sitting at
// client_shortlisted had `RANK[s] === undefined`, silently fell through the
// `if (rank === undefined) return;` guard below, and was dropped from
// submittedPlus/interviewPlus/offerPlus/placed entirely -- undercounting
// every funnel and conversion rate built on this file (Clients module +
// firm-wide Reports funnel) for any mandate with a client-shortlisted
// candidate who hadn't yet moved to a formal offer.
export const STAGE_ORDER = [
  "sourced",
  "screened",
  "shortlisted",
  "submitted",
  "client_interview",
  "client_shortlisted",
  "offer",
  "placed",
] as const;

export type PipelineStage = (typeof STAGE_ORDER)[number];

export const STAGE_LABELS: Record<PipelineStage, string> = {
  sourced: "Sourced",
  screened: "Screened",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  client_interview: "Interview",
  client_shortlisted: "Client Shortlisted",
  offer: "Offer",
  placed: "Placed",
};

const RANK: Record<string, number> = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]));

export type FunnelStats = {
  total: number;
  byStage: Record<string, number>;
  rejected: number;
  submittedPlus: number;
  interviewPlus: number;
  offerPlus: number;
  placed: number;
  subToInterviewRate: number | null;
  interviewToOfferRate: number | null;
  offerToPlacedRate: number | null;
  subToPlacedRate: number | null;
};

export function emptyFunnel(): FunnelStats {
  return {
    total: 0,
    byStage: {},
    rejected: 0,
    submittedPlus: 0,
    interviewPlus: 0,
    offerPlus: 0,
    placed: 0,
    subToInterviewRate: null,
    interviewToOfferRate: null,
    offerToPlacedRate: null,
    subToPlacedRate: null,
  };
}

export function computeFunnel(stages: (string | null | undefined)[]): FunnelStats {
  const byStage: Record<string, number> = {};
  let rejected = 0;
  let submittedPlus = 0;
  let interviewPlus = 0;
  let offerPlus = 0;
  let placed = 0;
  let total = 0;

  stages.forEach((s) => {
    if (!s) return;
    total += 1;
    byStage[s] = (byStage[s] ?? 0) + 1;
    if (s === "rejected") {
      rejected += 1;
      return;
    }
    const rank = RANK[s];
    if (rank === undefined) return;
    if (rank >= RANK.submitted) submittedPlus += 1;
    if (rank >= RANK.client_interview) interviewPlus += 1;
    if (rank >= RANK.offer) offerPlus += 1;
    if (rank >= RANK.placed) placed += 1;
  });

  const rate = (num: number, den: number) => (den > 0 ? num / den : null);

  return {
    total,
    byStage,
    rejected,
    submittedPlus,
    interviewPlus,
    offerPlus,
    placed,
    subToInterviewRate: rate(interviewPlus, submittedPlus),
    interviewToOfferRate: rate(offerPlus, interviewPlus),
    offerToPlacedRate: rate(placed, offerPlus),
    subToPlacedRate: rate(placed, submittedPlus),
  };
}

export function pct(n: number | null): string {
  if (n === null) return "—";
  return `${Math.round(n * 100)}%`;
}
