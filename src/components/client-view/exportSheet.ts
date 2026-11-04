import type { BoardCandidate, Role } from "./types";
import { computeFit } from "./fit";
import { STATUS_NAME, statusOf } from "./status";
import { passReasonLabel } from "./PassReasonDialog";


const esc = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

// A plain CSV: opens in Excel, and in Google Sheets via File > Import (or by dropping it into Drive).
export function shortlistCsv(role: Role, candidates: BoardCandidate[], roleUrl: string): string {
  const header = [
    "Candidate", "Current title", "Company", "Location", "Experience (yrs)", "Current fixed CTC (LPA)", "Expected fixed CTC (LPA)", "Notice period",
    "Requirements confirmed", "Your status", "Reason for passing", "Interview time", "Open in portal",
  ];
  const rows = candidates.map((c) => {
    const fit = computeFit(role, c);
    const reqs = fit.rows.filter((r) => r.key.startsWith("req-"));
    const status = STATUS_NAME[statusOf(c)];
    const pass = [passReasonLabel(c.client_pass_reason), c.client_pass_note].filter(Boolean).join(": ");
    return [
      c.full_name, c.current_job_title, c.current_employer, c.current_location, c.total_experience_years, c.current_fixed_ctc ?? "", c.expected_fixed_ctc, c.notice_period,
      reqs.length ? `${reqs.filter((r) => r.state === "met").length} of ${reqs.length}` : "", status, pass,
      when(c.confirmed_interview_at ?? c.requested_interview_at), roleUrl,
    ];
  });
  // BOM so Excel reads the rupee sign and accents correctly.
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
