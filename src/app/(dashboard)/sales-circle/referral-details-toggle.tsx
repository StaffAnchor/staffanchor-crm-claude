"use client";

import { useState } from "react";

const SALES_EXPERIENCE_LABELS: Record<string, string> = {
  b2b_sales: "B2B sales",
  b2c_sales: "B2C sales",
  both: "Both B2B and B2C",
  neither: "Neither / not a sales background",
};

function formatLakhs(n: number | null): string {
  if (n == null) return "—";
  return `₹${(n / 100000).toFixed(1)}L`;
}

export type ReferralDetails = {
  resume_signed_url: string | null;
  candidate_sales_experience: string | null;
  candidate_total_experience_years: number | null;
  candidate_expected_ctc: number | null;
  candidate_notice_period: string | null;
  why_fit: string | null;
  candidate_phone: string | null;
  candidate_email: string | null;
  candidate_linkedin_url: string | null;
};

export default function ReferralDetailsToggle({ details }: { details: ReferralDetails }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-slate-500 hover:text-slate-900 underline underline-offset-2"
      >
        {open ? "Hide details" : "View details"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2 text-[12px]">
          <div className="grid grid-cols-2 gap-2">
            <DetailRow label="Sales experience" value={details.candidate_sales_experience ? SALES_EXPERIENCE_LABELS[details.candidate_sales_experience] ?? details.candidate_sales_experience : "—"} />
            <DetailRow label="Total experience" value={details.candidate_total_experience_years != null ? `${details.candidate_total_experience_years} yrs` : "—"} />
            <DetailRow label="Expected CTC" value={formatLakhs(details.candidate_expected_ctc)} />
            <DetailRow label="Notice period" value={details.candidate_notice_period ?? "—"} />
            <DetailRow label="Phone" value={details.candidate_phone ?? "—"} />
            <DetailRow label="Email" value={details.candidate_email ?? "—"} />
          </div>
          {details.candidate_linkedin_url && (
            <a href={details.candidate_linkedin_url} target="_blank" rel="noopener noreferrer" className="block text-slate-700 underline underline-offset-2">
              LinkedIn →
            </a>
          )}
          {details.why_fit && (
            <p className="text-slate-600">
              <span className="font-medium text-slate-700">Why fit: </span>
              {details.why_fit}
            </p>
          )}
          {details.resume_signed_url ? (
            <a href={details.resume_signed_url} target="_blank" rel="noopener noreferrer" className="inline-block font-medium text-slate-900 underline underline-offset-2">
              View resume →
            </a>
          ) : (
            <p className="text-slate-400">No resume uploaded.</p>
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-slate-700 font-medium">{value}</div>
    </div>
  );
}
