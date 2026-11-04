"use client";

import { useState } from "react";
import { Check, Download, FileText, GraduationCap, MapPin, Minus, X } from "lucide-react";
import type { BoardCandidate, FeedbackValue, Role } from "./types";
import { columnOf, computeFit, type FitState } from "./fit";
import { statusOf } from "./status";
import StatusChip from "./StatusChip";
import ResumePreview from "./ResumePreview";
import { Chip, FitRing, initials, lakhLabel, monthLabel } from "./ui";
import FeedbackBar, { ReconsiderBar } from "./FeedbackBar";

type Job = { company: string; title: string; period: string };
type Degree = { degree: string | null; institution: string | null; year: string | null };

const period = (start?: string | null, end?: string | null, current?: boolean | null) => {
  const a = monthLabel(start);
  const b = current || (!end && a) ? "Present" : monthLabel(end);
  return [a, b].filter(Boolean).join(" to ");
};

// Last two jobs, newest first: the structured CV facts when the CV has been read, otherwise the plain career timeline.
function lastJobs(c: BoardCandidate): { jobs: Job[]; more: number } {
  const facts = (c.cv_roles ?? []).filter((r) => r.company || r.title);
  const all: Job[] = facts.length
    ? facts.map((r) => ({ company: r.company ?? "", title: r.title ?? "", period: period(r.start, r.end, r.is_current) }))
    : (c.career_timeline ?? []).filter((r) => r.company || r.title).map((r) => ({ company: r.company ?? "", title: r.title ?? "", period: period(r.start_month, r.end_month) }));
  return { jobs: all.slice(0, 2), more: Math.max(0, all.length - 2) };
}

function degrees(c: BoardCandidate): Degree[] {
  if (!Array.isArray(c.cv_education)) return [];
  return (c.cv_education as Record<string, unknown>[])
    .map((e) => ({
      degree: typeof e?.degree === "string" ? e.degree : null,
      institution: typeof e?.institution === "string" ? e.institution : null,
      year: typeof e?.year === "string" ? e.year : null,
    }))
    .filter((e) => e.degree || e.institution)
    .slice(0, 2);
}

const STATE_ICON: Record<FitState, { icon: React.ReactNode; cls: string }> = {
  met: { icon: <Check className="h-3 w-3" />, cls: "text-emerald-700" },
  partial: { icon: <Minus className="h-3 w-3" />, cls: "text-amber-700" },
  unmet: { icon: <X className="h-3 w-3" />, cls: "text-rose-700" },
  unknown: { icon: <Minus className="h-3 w-3" />, cls: "text-slate-400" },
};

function firstSentence(s: string | null) {
  if (!s) return null;
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}

// The same shortlisted person as the compact tile, laid out as a profile card: who they are, last jobs, degree, how they meet
// what you asked for, and your decision buttons, all visible without opening anything. Every field here is one the portal
// already shows a client (the recruiter's note, notice and relocation as confirmed on the call, expected pay and so on).
export default function ProfileCard({
  role,
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
  const fit = computeFit(role, c);
  const { jobs, more } = lastJobs(c);
  const edu = degrees(c);
  const summary = firstSentence(c.ai_summary);
  const notice = c.verified_notice || c.notice_period;
  const relocation = c.verified_relocation || c.open_to_relocation;
  const reviewRows = c.share_review?.requirements ?? [];
  const reviewMet = reviewRows.filter((r) => r.status === "met").length;
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvBusy, setCvBusy] = useState<"preview" | "download" | null>(null);
  const [cvError, setCvError] = useState(false);

  async function cv(mode: "preview" | "download") {
    if (!c.resume_file_url || !getResumeUrl || cvBusy) return;
    setCvBusy(mode);
    setCvError(false);
    const url = await getResumeUrl(c.resume_file_url);
    setCvBusy(null);
    if (!url) return setCvError(true);
    if (mode === "preview") return setCvUrl(url);
    const a = document.createElement("a");
    a.href = url;
    a.download = c.resume_file_url.replace(/^resumes\//, "");
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }

  const facts: [string, string | null][] = [
    ["Experience", c.total_experience_years !== null && c.total_experience_years !== "" ? `${Number(c.total_experience_years)} yrs` : null],
    ["Location", c.current_location],
    ["Relocation", relocation],
    ["Notice period", notice],
    ["Current CTC", lakhLabel(c.current_fixed_ctc ?? null)],
    ["Expected CTC", lakhLabel(c.expected_fixed_ctc)],
  ];

  return (
    <div className={`min-w-0 rounded-2xl border border-[#ece7de] bg-white p-4 shadow-[0_1px_2px_rgba(60,40,20,0.04)] transition-shadow hover:shadow-[0_6px_20px_rgba(60,40,20,0.08)] sm:p-5 ${col === "closed" ? "opacity-80" : ""}`}>
      <div className="grid gap-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Who they are */}
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f1e9dc] text-[13px] font-semibold text-[#7a5b34]">{initials(c.full_name)}</div>
            <div className="min-w-0">
              <button type="button" onClick={onOpen} className="block max-w-full truncate text-left text-[16px] font-semibold text-[#1f6f5c] hover:underline">
                {c.full_name}
              </button>
              <p className="truncate text-[12.5px] text-slate-500">
                {c.current_job_title ?? "—"}
                {c.current_employer ? ` · ${c.current_employer}` : ""}
              </p>
            </div>
          </div>
          <div className="mt-2"><StatusChip c={c} /></div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {c.recommendation === "Strong Fit" && <Chip tone="good">Recommended</Chip>}
            {c.confirmed_on_call_at && <Chip tone="info">Confirmed on a call</Chip>}
          </div>
          <dl className="mt-3 space-y-1 text-[13px]">
            {facts.map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-1.5">
                  <dt className="shrink-0 font-semibold text-slate-800">{k}:</dt>
                  <dd className="min-w-0 text-slate-600">
                    {k === "Location" && <MapPin className="mr-1 inline h-3 w-3 text-slate-400" />}
                    {v}
                  </dd>
                </div>
              ) : null
            )}
            {c.shortlisted_at && (
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-semibold text-slate-800">Shared on:</dt>
                <dd className="text-slate-600">{new Date(c.shortlisted_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Last jobs */}
        <div className="min-w-0 space-y-3 text-[13px]">
          {jobs.length === 0 ? (
            <p className="text-slate-400">Job history is not available yet.</p>
          ) : (
            jobs.map((j, i) => (
              <div key={i}>
                <p className="truncate font-semibold text-slate-900">{j.company || "Company not stated"}</p>
                <p className="truncate text-slate-500">{j.title}</p>
                {j.period && <p className="text-slate-400">{j.period}</p>}
              </div>
            ))
          )}
          {more > 0 && (
            <button type="button" onClick={onOpen} className="text-[12.5px] font-medium text-[#2563a8] hover:underline">
              {more} more work experience &rsaquo;
            </button>
          )}
          {c.selling?.sells_now?.length ? <p className="text-[12.5px] text-slate-500">Sells: {c.selling.sells_now.slice(0, 3).join(", ")}</p> : null}
        </div>

        {/* Education */}
        <div className="min-w-0 space-y-3 text-[13px]">
          {edu.length === 0 ? (
            <p className="text-slate-400">Education is not available yet.</p>
          ) : (
            edu.map((e, i) => (
              <div key={i} className="flex gap-1.5">
                <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{e.institution || e.degree}</p>
                  {e.institution && e.degree && <p className="truncate text-slate-500">{e.degree}</p>}
                  {e.year && <p className="text-slate-400">{e.year}</p>}
                </div>
              </div>
            ))
          )}
          {c.cv_certifications && c.cv_certifications.length > 0 && <p className="text-[12.5px] text-slate-500">{c.cv_certifications.slice(0, 2).join(" · ")}</p>}
        </div>
      </div>

      {/* Against what you asked for: the recruiter's own review when they wrote one, otherwise the automatic comparison */}
      {reviewRows.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#ece7de] bg-[#faf7f1] px-3 py-2.5">
          <p className="text-[12.5px] font-semibold text-slate-800">
            {reviewMet} of {reviewRows.length} requirements met
            {c.share_review?.reviewer_name ? <span className="font-normal text-slate-500"> &middot; reviewed by {c.share_review.reviewer_name}</span> : null}
          </p>
          <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
            {reviewRows.slice(0, 6).map((r, i) => {
              const st = STATE_ICON[r.status === "met" ? "met" : r.status === "partial" ? "partial" : "unmet"];
              return (
                <li key={i} className={`inline-flex items-center gap-1 ${st.cls}`} title={r.note || undefined}>
                  {st.icon}
                  <span className="text-slate-700">
                    {r.requirement}
                    {r.kind === "good" ? " (nice to have)" : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : fit.rows.length > 0 && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#ece7de] bg-[#faf7f1] px-3 py-2.5">
          <FitRing fit={fit} size={44} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-slate-800">
              {fit.pct === null ? "Not enough information to compare yet" : `${fit.points} of ${fit.total} things you asked for are met`}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
              {fit.rows.slice(0, 6).map((r) => (
                <li key={r.key} className={`inline-flex items-center gap-1 ${STATE_ICON[r.state].cls}`} title={`You asked for ${r.asked}. They have ${r.got}.`}>
                  {STATE_ICON[r.state].icon}
                  <span className="text-slate-700">
                    {r.label}: {r.got}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {summary && <p className="mt-3 line-clamp-2 text-[12.5px] leading-5 text-slate-600">{summary}</p>}
      {c.client_note && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[12.5px] leading-5 text-amber-900">
          <span className="font-semibold">Note from StaffAnchor:</span> {c.client_note}
        </p>
      )}

      {/* CV and decision */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#f1ece3] pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {c.resume_file_url && getResumeUrl ? (
            <>
              <button type="button" onClick={() => void cv("preview")} disabled={!!cvBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4dccd] bg-[#faf7f1] px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-[#f3eee4] disabled:opacity-60">
                <FileText className="h-3.5 w-3.5" /> {cvBusy === "preview" ? "Opening…" : "Preview CV"}
              </button>
              <button type="button" onClick={() => void cv("download")} disabled={!!cvBusy} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4dccd] bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-[#f3eee4] disabled:opacity-60">
                <Download className="h-3.5 w-3.5" /> {cvBusy === "download" ? "Preparing…" : "Download CV"}
              </button>
            </>
          ) : null}
          {cvError && <span className="text-[11.5px] text-amber-700">Couldn&apos;t open. Ask your recruiter.</span>}
          <button type="button" onClick={onOpen} className="text-[12.5px] font-medium text-[#7a5b34] underline-offset-2 hover:underline">
            Full profile &rarr;
          </button>
        </div>
        {col !== "closed" && (
          <div className="min-w-[240px] flex-1 sm:flex-none">
            <FeedbackBar candidate={c} onFeedback={onFeedback} compact onOpenProfile={onOpen} />
          </div>
        )}
        {statusOf(c) === "passed_cv" && <ReconsiderBar candidate={c} onFeedback={onFeedback} />}
      </div>
      {cvUrl && c.resume_file_url && <ResumePreview signedUrl={cvUrl} fileName={c.resume_file_url.replace(/^resumes\//, "")} hideTrigger defaultOpen onClose={() => setCvUrl(null)} />}
    </div>
  );
}
