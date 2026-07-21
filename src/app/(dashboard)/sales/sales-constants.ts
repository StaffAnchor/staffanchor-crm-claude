// Shared vocabulary for the Sales module -- StaffAnchor's OWN outbound
// business-development pipeline (finding new client companies to sell
// recruiting services to), completely separate from the candidates/
// mandates pipeline everywhere else in this app.

export const STAGES = [
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
};

export type SalesActivityRow = {
  id: string;
  lead_id: string;
  activity_type: string;
  detail: string | null;
  actor_id: string | null;
  at: string;
};

export function formatDealValue(value: number | null, currency: string | null) {
  if (value == null) return null;
  const cur = currency ?? "INR";
  const symbol = cur === "INR" ? "₹" : cur === "USD" ? "$" : `${cur} `;
  return `${symbol}${value.toLocaleString("en-IN")}`;
}
