"use client";

import { useState } from "react";
import { FileText, MapPin } from "lucide-react";
import type { BoardCandidate, FeedbackValue, Role } from "./types";
import { columnOf } from "./fit";
import { statusOf } from "./status";
import StatusChip from "./StatusChip";
import ResumePreview from "./ResumePreview";
import { Chip, initials, lakhLabel } from "./ui";
import FeedbackBar, { ReconsiderBar } from "./FeedbackBar";

function firstSentence(s: string | null) {
  if (!s) return null;
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}

export default function CandidateCard({
  c,
  onOpen,
  getResumeUrl,
  onFeedback,
}: {
  role: Role;
  c: BoardCandidate;
  onOpen: () => void;
  getResumeUrl?: (path: string) => Promise<string | null>;
  onFeedback: (linkId: string, value: FeedbackValue, interviewAt?: string, extra?: { reason: string; note: string }) => Promise<void>;
}) {
  const col = columnOf(c);
  const ctc = lakhLabel(c.expected_fixed_ctc);
  const currentCtc = lakhLabel(c.current_fixed_ctc ?? null);
  const notice = c.notice_period;
  const summary = firstSentence(c.ai_summary);
  const [cvBusy, setCvBusy] = useState(false);
  const [cvError, setCvError] = useState(false);

  const [cvUrl, setCvUrl] = useState<string | null>(null);

  // The CV opens in the in-page preview (with its own Download button), not as a file download.
  async function openCv() {
    if (!c.resume_file_url || !getResumeUrl || cvBusy) return;
    setCvBusy(true);
    setCvError(false);
    const url = await getResumeUrl(c.resume_file_url);
    if (url) setCvUrl(url);
    else setCvError(true);
    setCvBusy(false);
  }

  return (
    <div className="min-w-0 rounded-2xl border border-[#ece7de] bg-white p-4 shadow-[0_1px_2px_rgba(60,40,20,0.04)] transition-shadow hover:shadow-[0_6px_20px_rgba(60,40,20,0.08)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f1e9dc] text-[13px] font-semibold text-[#7a5b34]">{initials(c.full_name)}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14.5px] font-semibold text-slate-900">{c.full_name}</p>
            <p className="truncate text-[12.5px] text-slate-500">
              {c.current_job_title ?? "—"}
              {c.current_employer ? ` · ${c.current_employer}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-3"><StatusChip c={c} /></div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {c.recommendation === "Strong Fit" && <Chip tone="good">Recommended</Chip>}
          {c.total_experience_years !== null && c.total_experience_years !== "" && <Chip>{Number(c.total_experience_years)} yrs</Chip>}
          {currentCtc && <Chip>{currentCtc} current</Chip>}
          {ctc && <Chip>{ctc} expected</Chip>}
          {notice && <Chip>{notice}</Chip>}
        </div>

        {c.current_location && (
          <p className="mt-2 flex items-center gap-1 text-[12px] text-slate-500">
            <MapPin className="h-3 w-3" /> {c.current_location}
          </p>
        )}
        {c.client_note && (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12.5px] leading-5 text-amber-900">
            <span className="font-semibold">Note from StaffAnchor:</span> {c.client_note}
          </p>
        )}
        {summary && <p className="mt-2 line-clamp-2 text-[12.5px] leading-5 text-slate-600">{summary}</p>}
      </button>

      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {c.resume_file_url && getResumeUrl && (
            <button type="button" onClick={openCv} disabled={cvBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4dccd] bg-[#faf7f1] px-2.5 py-1 text-[12px] font-medium text-slate-700 hover:bg-[#f3eee4] disabled:opacity-60">
              <FileText className="h-3.5 w-3.5" /> {cvBusy ? "Opening…" : "Original CV"}
            </button>
          )}
          {cvError && <span className="text-[11.5px] text-amber-700">Couldn&apos;t open. Ask your recruiter.</span>}
        </div>
        <button type="button" onClick={onOpen} className="text-[12.5px] font-medium text-[#7a5b34] underline-offset-2 hover:underline">
          Click here to view more →
        </button>
      </div>
      {cvUrl && c.resume_file_url && <ResumePreview signedUrl={cvUrl} fileName={c.resume_file_url.replace(/^resumes\//, "")} hideTrigger defaultOpen onClose={() => setCvUrl(null)} />}

      {col !== "closed" && (
        <div className="mt-3 border-t border-[#f1ece3] pt-3">
          <FeedbackBar candidate={c} onFeedback={onFeedback} compact onOpenProfile={onOpen} />
        </div>
      )}
      {statusOf(c) === "passed_cv" && (
        <div className="mt-3 border-t border-[#f1ece3] pt-3">
          <ReconsiderBar candidate={c} onFeedback={onFeedback} />
        </div>
      )}
    </div>
  );
}
