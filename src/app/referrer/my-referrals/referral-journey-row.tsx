"use client";

import { useState } from "react";
import { Check, ChevronDown, FileText } from "lucide-react";
import { lpa } from "@/lib/sales-circle";
import { ENDED_STATUS, REFERRAL_STAGES, STAGE_LABEL, isEnded, referralGroup, stageIndex } from "@/lib/referral-stages";

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

// Deliberately has no client name: referrers never see the company, and the
// page never sends it down to the browser.
export type ReferralJourneyData = {
  id: string;
  candidate_name: string;
  candidate_current_company: string | null;
  status: string;
  created_at: string;
  role_title: string | null;
  resume_signed_url: string | null;
  candidate_sales_experience: string | null;
  candidate_total_experience_years: number | null;
  candidate_expected_ctc: number | null;
  candidate_notice_period: string | null;
  why_fit: string | null;
  history: ReferralHistoryEntry[];
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

const PILL: Record<ReturnType<typeof referralGroup>, string> = {
  progress: "bg-indigo-50 text-indigo-700",
  joined: "bg-emerald-50 text-emerald-700",
  ended: "bg-rose-50 text-rose-700",
};

function Stepper({ status, history }: { status: string; history: ReferralHistoryEntry[] }) {
  const ended = isEnded(status);
  // For an ended referral, show how far it got before it stopped.
  const reached = ended
    ? Math.max(-1, ...history.map((h) => stageIndex(h.to_status)))
    : stageIndex(status);
  const dateAt = (key: string) => history.find((h) => h.to_status === key)?.created_at;

  return (
    <ol className="grid grid-cols-5 gap-y-4 sm:grid-cols-10">
      {REFERRAL_STAGES.map((s, i) => {
        const done = i < reached || (!ended && i === reached && i >= stageIndex("joined"));
        const current = !ended && i === reached && !done;
        const d = dateAt(s.key);
        return (
          <li key={s.key} className="flex flex-col items-center text-center" title={s.hint}>
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ${
                done
                  ? "bg-emerald-500 text-white ring-emerald-100"
                  : current
                    ? "bg-indigo-600 text-white ring-indigo-100"
                    : i <= reached && ended
                      ? "bg-slate-300 text-white ring-slate-100"
                      : "bg-slate-100 text-slate-400 ring-white"
              }`}
            >
              {done || (ended && i <= reached) ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={`mt-1.5 text-[10.5px] font-medium leading-tight ${current ? "text-indigo-700" : done ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
            {d && <span className="mt-0.5 text-[10px] text-slate-400">{new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function ReferralJourneyRow({ referral }: { referral: ReferralJourneyData }) {
  const [open, setOpen] = useState(false);
  const group = referralGroup(referral.status);
  const endedNote = ENDED_STATUS[referral.status];

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-50/70">
        <div className="min-w-0">
          <div className="truncate text-[14.5px] font-semibold text-slate-900">{referral.candidate_name}</div>
          <div className="mt-0.5 truncate text-[12.5px] text-slate-500">
            {referral.candidate_current_company ? `${referral.candidate_current_company} · ` : ""}
            {referral.role_title ? `for ${referral.role_title}` : "Added to our bench"} · referred {formatDate(referral.created_at)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${PILL[group]}`}>{STAGE_LABEL[referral.status] ?? referral.status}</span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="space-y-5 border-t border-slate-100 bg-slate-50/50 px-5 pb-6 pt-5">
          {endedNote && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[12.5px] font-medium text-rose-700">{endedNote}. This referral has closed.</p>}

          <Stepper status={referral.status} history={referral.history} />

          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              ["Sales experience", referral.candidate_sales_experience ? SALES_EXPERIENCE_LABELS[referral.candidate_sales_experience] ?? referral.candidate_sales_experience : "—"],
              ["Total experience", referral.candidate_total_experience_years != null ? `${referral.candidate_total_experience_years} yrs` : "—"],
              ["Expected CTC", lpa(referral.candidate_expected_ctc)],
              ["Notice period", referral.candidate_notice_period ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-100">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="mt-0.5 text-[13px] font-medium text-slate-800">{v}</dd>
              </div>
            ))}
          </dl>

          {referral.why_fit && (
            <p className="text-[12.5px] leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-700">Why you said they fit: </span>
              {referral.why_fit}
            </p>
          )}

          {referral.resume_signed_url && (
            <a href={referral.resume_signed_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900 underline underline-offset-2">
              <FileText className="h-3.5 w-3.5" /> View the resume you uploaded
            </a>
          )}
        </div>
      )}
    </div>
  );
}
