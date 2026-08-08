// Shared vocabulary for the Sales module -- StaffAnchor's OWN outbound
// business-development pipeline (finding new client companies to sell
// recruiting services to), completely separate from the candidates/
// mandates pipeline everywhere else in this app.

export const STAGES = [
  // Merged in from the former separate /targets (target_accounts) page --
  // both modeled "a company we want as a client, not yet signed" with no
  // link between them, so one pipeline replaces two. Researching = pure
  // account research, no outreach sent yet; Prospecting = outreach sent
  // but no reply/conversation yet.
  { key: "researching", label: "Researching" },
  { key: "prospecting", label: "Prospecting" },
  { key: "contacted", label: "Contacted" },
  { key: "meeting_booked", label: "Meeting Booked" },
  { key: "proposal_sent", label: "Proposal Sent" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
] as const;

export type SalesStage = (typeof STAGES)[number]["key"];

export const STAGE_LABEL: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const SOURCES = [
  { key: "manual", label: "Manual" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "apollo", label: "Apollo.io" },
  { key: "lusha", label: "Lusha" },
  { key: "zoominfo", label: "ZoomInfo" },
  { key: "referral", label: "Referral" },
  { key: "inbound", label: "Inbound" },
  // Leads converted over from Employer Inquiries via "Move to Sales Lead" --
  // added to the sales_leads_source_check constraint alongside this entry.
  { key: "website", label: "Website" },
] as const;

export type SalesSource = (typeof SOURCES)[number]["key"];

export const SOURCE_LABEL: Record<string, string> = Object.fromEntries(SOURCES.map((s) => [s.key, s.label]));

export type SalesLeadRow = {
  id: string;
  company_name: string;
  company_domain: string | null;
  company_industry: string | null;
  company_size: string | null;
  contact_name: string | null;
  contact_title: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  linkedin_url: string | null;
  stage: string;
  source: string;
  deal_value: number | null;
  deal_value_currency: string | null;
  notes: string | null;
  lost_reason: string | null;
  next_follow_up_date: string | null;
  owner_id: string | null;
  stage_updated_at: string;
  created_at: string;
  updated_at: string;
  converted_client_id: string | null;
};

// Stage-weighted odds of a lead actually converting to a signed client --
// same auditable-heuristic philosophy as fill-probability.ts and the
// Morning Briefing billing forecast (get_my_morning_briefing()), not
// learned/AI. Kept here so the Sales page's own forecast tile and the
// Morning Briefing RPC agree on the same numbers conceptually.
export const STAGE_WIN_PROBABILITY: Record<string, number> = {
  researching: 0.03,
  prospecting: 0.08,
  contacted: 0.15,
  meeting_booked: 0.35,
  proposal_sent: 0.6,
  won: 1,
  lost: 0,
};

export type SalesActivityRow = {
  id: string;
  lead_id: string;
  activity_type: string;
  detail: string | null;
  actor_id: string | null;
  at: string;
};

// Row shape from the sales_leads_scored view -- same columns as
// sales_leads plus two computed-fresh-on-read fields used to sort "who
// should I call next" instead of just "last touched". See the
// sales_ae_assist_briefing_and_scoring migration for the scoring formula.
export type SalesLeadScoredRow = SalesLeadRow & {
  priority_score: number;
  days_in_stage: number;
};

export function priorityTone(score: number): "success" | "warning" | "neutral" {
  if (score >= 60) return "success";
  if (score >= 35) return "warning";
  return "neutral";
}

export function priorityLabel(score: number): string {
  if (score >= 60) return "Hot";
  if (score >= 35) return "Warm";
  return "Cold";
}

export function formatDealValue(value: number | null, currency: string | null) {
  if (value == null) return null;
  const cur = currency ?? "INR";
  const symbol = cur === "INR" ? "₹" : cur === "USD" ? "$" : `${cur} `;
  return `${symbol}${value.toLocaleString("en-IN")}`;
}
