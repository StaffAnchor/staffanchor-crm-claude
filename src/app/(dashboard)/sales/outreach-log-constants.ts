// Vocabulary for the Outreach Log -- a lightweight record of the founder's
// manual LinkedIn/email outreach, deliberately separate from sales_leads
// (see the sales_outreach_log migration). Most of these 15-20/day messages
// never turn into anything; this exists purely so nothing gets forgotten
// and follow-ups have a date to show up against.

export const OUTREACH_STATUSES = [
  { key: "sent", label: "Sent" },
  { key: "no_response", label: "No response" },
  { key: "replied", label: "Replied" },
  { key: "interested", label: "Interested" },
  { key: "not_interested", label: "Not interested" },
] as const;

export type OutreachStatus = (typeof OUTREACH_STATUSES)[number]["key"];

export const OUTREACH_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  OUTREACH_STATUSES.map((s) => [s.key, s.label])
);

export const OUTREACH_STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "info"> = {
  sent: "neutral",
  no_response: "warning",
  replied: "info",
  interested: "success",
  not_interested: "neutral",
};

export type OutreachLogRow = {
  id: string;
  company_name: string;
  company_domain: string | null;
  contact_name: string | null;
  contact_title: string | null;
  role_hint: string | null;
  channel: "linkedin" | "email";
  message_snippet: string | null;
  sent_at: string;
  follow_up_date: string | null;
  status: string;
  notes: string | null;
  owner_id: string | null;
  converted_lead_id: string | null;
  created_at: string;
  updated_at: string;
};

export function isFollowUpDue(row: OutreachLogRow): boolean {
  if (!row.follow_up_date) return false;
  if (row.status === "replied" || row.status === "interested" || row.status === "not_interested") return false;
  return new Date(row.follow_up_date) <= new Date(new Date().toDateString());
}
