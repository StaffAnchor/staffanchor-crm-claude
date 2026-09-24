"use client";

import { useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  screened: "Screened",
  candidate_interested: "Candidate interested",
  submitted_to_client: "Submitted to client",
  interviewing: "Interviewing",
  offered: "Offered",
  joined: "Joined",
  ninety_days_completed: "90 days completed",
  payment_received: "Payment received from client",
  payout_processed: "Payout processed",
  not_suitable: "Not suitable",
  candidate_declined: "Candidate declined",
  dropped_out: "Dropped out",
  left_before_90_days: "Left before 90 days",
};
const STATUS_TONE: Record<string, string> = {
  submitted: "bg-slate-100 text-slate-700",
  screened: "bg-blue-100 text-blue-700",
  candidate_interested: "bg-blue-100 text-blue-700",
  submitted_to_client: "bg-indigo-100 text-indigo-700",
  interviewing: "bg-indigo-100 text-indigo-700",
  offered: "bg-amber-100 text-amber-700",
  joined: "bg-emerald-100 text-emerald-700",
  ninety_days_completed: "bg-emerald-100 text-emerald-700",
  payment_received: "bg-emerald-100 text-emerald-700",
  payout_processed: "bg-emerald-100 text-emerald-700",
  not_suitable: "bg-rose-100 text-rose-700",
  candidate_declined: "bg-rose-100 text-rose-700",
  dropped_out: "bg-rose-100 text-rose-700",
  left_before_90_days: "bg-rose-100 text-rose-700",
};

const SALES_EXPERIENCE_LABELS: Record<string, string> = {
  b2b_sales: "B2B sales",
  b2c_sales: "B2C sales",
  both: "Both B2B and B2C",
  neither: "Neither / not a sales background",
};

export type ReferralHistoryEntry = {
  id: string;
  from_status: string | null;
  to_status: string;
  created_at: string;
};

export type ReferralJourneyData = {
  id: string;
  candidate_name: string;
  candidate_current_company: string | null;
  status: string;
  created_at: string;
  role_title: string | null;
  client_name: string | null;
  resume_signed_url: string | null;
  candidate_sales_experience: string | null;
  candidate_total_experience_years: number | null;
  candidate_expected_ctc: number | null;
  candidate_notice_period: string | null;
  why_fit: string | null;
  history: ReferralHistoryEntry[];
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatLakhs(n: number | null): string {
  if (n == null) return "—";
  return `₹${(n / 100000).toFixed(1)}L`;
}

export default function ReferralJourneyRow({ referral }: { referral: ReferralJourneyData }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors"
      >
        <div>
          <div className="text-[14px] font-medium text-slate-900">{referral.candidate_name}</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {referral.candidate_current_company ? `${referral.candidate_current_company} · ` : ""}
            {referral.role_title ? `for ${referral.role_title}` : "Bench referral"}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${STATUS_TONE[referral.status] ?? "bg-slate-100 text-slate-700"}`}>
            {STATUS_LABELS[referral.status] ?? referral.status}
          </span>
          <span className="text-slate-300 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 bg-slate-50/60 border-t border-slate-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3">
            <Stat label="Sales experience" value={referral.candidate_sales_experience ? SALES_EXPERIENCE_LABELS[referral.candidate_sales_experience] ?? referral.candidate_sales_experience : "—"} />
            <Stat label="Total experience" value={referral.candidate_total_experience_years != null ? `${referral.candidate_total_experience_years} yrs` : "—"} />
            <Stat label="Expected CTC" value={formatLakhs(referral.candidate_expected_ctc)} />
            <Stat label="Notice period" value={referral.candidate_notice_period ?? "—"} />
          </div>

          {referral.why_fit && (
            <p className="text-[12px] text-slate-600 mt-3">
              <span className="font-medium text-slate-700">Why fit: </span>
              {referral.why_fit}
            </p>
          )}

          {referral.resume_signed_url && (
            <a
              href={referral.resume_signed_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-900 mt-3 underline underline-offset-2"
            >
              View resume →
            </a>
          )}

          <div className="mt-4">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Journey</div>
            <ol className="space-y-2.5">
              {referral.history.length === 0 && <li className="text-[12px] text-slate-400">No history yet.</li>}
              {referral.history.map((h) => (
                <li key={h.id} className="flex items-start gap-2.5">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
                  <div>
                    <div className="text-[12.5px] font-medium text-slate-800">
                      {STATUS_LABELS[h.to_status] ?? h.to_status}
                    </div>
                    <div className="text-[11px] text-slate-400">{formatDate(h.created_at)}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[13px] font-medium text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}
