"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Check, CircleHelp, X } from "lucide-react";
import ResumePreview from "./ResumePreview";
import type { BoardCandidate, CvRole, FeedbackValue, Role } from "./types";
import { computeFit, type FitState } from "./fit";
import { Chip, LABEL, formatSlot, initials, lakhLabel, monthLabel } from "./ui";
import FeedbackBar from "./FeedbackBar";
import type { OnePager } from "./onepager";

const STATE_ICON: Record<FitState, { icon: React.ReactNode; cls: string }> = {
  met: { icon: <Check className="h-3.5 w-3.5" />, cls: "bg-emerald-100 text-emerald-700" },
  partial: { icon: <CircleHelp className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-500" },
  unmet: { icon: <CircleHelp className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-500" },
  unknown: { icon: <CircleHelp className="h-3.5 w-3.5" />, cls: "bg-slate-100 text-slate-500" },
};

function Section({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#ece7de] bg-white p-5">
      <h3 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-slate-900">
        {n !== undefined && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#e8896a] text-[11px] font-bold text-white">{n}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 text-[13.5px] text-slate-800">{value}</p>
    </div>
  );
}

function dates(r: { start?: string | null; end?: string | null; is_current?: boolean | null }) {
  const s = monthLabel(r.start);
  const e = r.is_current ? "Present" : monthLabel(r.end);
  return [s, e].filter(Boolean).join(" – ");
}

// The stored AI summary is one long paragraph that already has the resume
// highlights pasted onto its end. Clients get one headline and a few short
// points; the full text stays one tap away.
function tidy(s: string) {
  return s.replace(/\s+/g, " ").replace(/\.{2,}/g, ".").replace(/\.;/g, ";").trim();
}
function firstSentence(s: string) {
  const m = s.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}
function clip(s: string, max = 120) {
  const t = tidy(s).replace(/[.;]$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(" ")).replace(/[,;:\-–]$/, "") + "…";
}

export default function CandidateDrawer({
  role,
  c,
  onClose,
  onFeedback,
  getResumeUrl,
  getOnePager,
}: {
  role: Role;
  c: BoardCandidate;
  onClose: () => void;
  onFeedback: (linkId: string, value: FeedbackValue, interviewAt?: string, extra?: { reason: string; note: string }) => Promise<void>;
  getResumeUrl?: (path: string) => Promise<string | null>;
  getOnePager?: (candidateId: string) => Promise<OnePager | null>;
}) {
  const [onePager, setOnePager] = useState<OnePager | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (getOnePager) getOnePager(c.candidate_id).then((o) => !cancelled && setOnePager(o));
    return () => {
      cancelled = true;
    };
  }, [c.candidate_id, getOnePager]);
  const fit = computeFit(role, c);
  const [showFull, setShowFull] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const [resumeState, setResumeState] = useState<"idle" | "loading" | "ok" | "error">(c.resume_file_url && getResumeUrl ? "loading" : "idle");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    if (c.resume_file_url && getResumeUrl) {
      getResumeUrl(c.resume_file_url).then((u) => {
        if (cancelled) return;
        setResumeUrl(u);
        setResumeState(u ? "ok" : "error");
      });
    }
    return () => {
      cancelled = true;
    };
  }, [c.resume_file_url, getResumeUrl]);

  const s = c.selling ?? {};
  const deal = s.deal_size ?? s.ticket;
  const target = s.revenue_snapshot?.target;
  const tools = Array.from(new Set([...(s.crm_tools ?? []), ...(c.cv_tools ?? [])])).slice(0, 10);
  const roles: CvRole[] =
    c.cv_roles && c.cv_roles.length
      ? c.cv_roles
      : (c.career_timeline ?? []).map((t, i) => ({ title: t.title, company: t.company, start: t.start_month, end: t.end_month, is_current: !t.end_month && i === 0, evidence: t.description }));
  const highlights = (c.ai_passport?.resume_highlights ?? []).slice(0, 4);
  const fullSummary = tidy((c.ai_summary ?? "").split(/Resume highlights:/i)[0]);
  const headline = tidy(c.ai_passport?.headline ?? "") || (fullSummary ? firstSentence(fullSummary) : "");
  const hasMore = fullSummary.length > headline.length + 20;
  const mustHaves = role.must_haves ?? [];
  const checkedRequirements = new Set((c.ai_checks?.must ?? []).map((x) => x.requirement));
  const unchecked = c.share_review ? [] : mustHaves.filter((m) => !checkedRequirements.has(m));
  const reqRows = fit.rows.filter((r) => r.key.startsWith("req-"));
  const reqSummary = reqRows.length
    ? { total: reqRows.length, met: reqRows.filter((r) => r.state === "met").length, partial: reqRows.filter((r) => r.state === "partial").length, unmet: reqRows.filter((r) => r.state === "unmet").length }
    : null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${c.full_name} profile`}>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-slate-900/40" />
      <div className="relative flex h-full w-full max-w-[640px] flex-col bg-[#faf8f4] shadow-2xl">
        <div className="flex items-start gap-4 border-b border-[#ece7de] bg-white px-6 py-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f1e9dc] text-[15px] font-semibold text-[#7a5b34]">{initials(c.full_name)}</div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[20px] font-semibold tracking-tight text-slate-900">{c.full_name}</h2>
            <p className="text-[13px] text-slate-500">
              {c.current_job_title ?? "—"}
              {c.current_employer ? ` at ${c.current_employer}` : ""}
            </p>
            <p className="mt-0.5 text-[12px] text-slate-400">
              {[c.current_location, c.total_experience_years !== null && c.total_experience_years !== "" ? `${Number(c.total_experience_years)} yrs experience` : null].filter(Boolean).join(" · ")}
            </p>
            {c.resume_file_url && getResumeUrl && (
              <div className="mt-2">
                {resumeState === "ok" && resumeUrl ? (
                  <ResumePreview signedUrl={resumeUrl} fileName={c.resume_file_url.replace(/^resumes\//, "")} label="View resume" />
                ) : resumeState === "error" ? (
                  <p className="text-[12px] text-amber-700">Resume can&apos;t be opened right now. Ask your StaffAnchor recruiter to send it.</p>
                ) : (
                  <p className="text-[12px] text-slate-400">Loading resume…</p>
                )}
              </div>
            )}
            {!c.resume_file_url && <p className="mt-2 text-[12px] text-slate-400">No resume on file yet.</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            {c.recommendation === "Strong Fit" && <Chip tone="good">Recommended by StaffAnchor</Chip>}
          </div>

          {c.client_note && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-800">Note from StaffAnchor</p>
              <p className="mt-1 whitespace-pre-line text-[14px] leading-6 text-amber-950">{c.client_note}</p>
            </div>
          )}

          {onePager && (
            <Section title="Summary from your StaffAnchor recruiter">
              <p className="text-[15px] font-semibold text-slate-900">{onePager.brief.headline}</p>
              <p className="mt-1.5 text-[13.5px] leading-6 text-slate-700">{onePager.brief.summary}</p>
              {onePager.brief.signals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {onePager.brief.signals.map((x) => (
                    <Chip key={x}>{x}</Chip>
                  ))}
                </div>
              )}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {onePager.brief.selling.length > 0 && (
                  <div>
                    <p className={LABEL}>What they have sold</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-700">{onePager.brief.selling.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
                {onePager.brief.strengths.length > 0 && (
                  <div>
                    <p className={LABEL}>Strengths</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-700">{onePager.brief.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
                  </div>
                )}
              </div>
              {onePager.brief.recruiter_take && (
                <p className="mt-4 rounded-lg bg-[#faf6ee] px-3 py-2 text-[13px] text-slate-700">
                  <span className="font-semibold text-slate-900">Our view:</span> {onePager.brief.recruiter_take}
                </p>
              )}
              {onePager.brief.probe.length > 0 && (
                <div className="mt-4">
                  <p className={LABEL}>To confirm on the call</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-[13px] text-slate-700">{onePager.brief.probe.map((x) => <li key={x}>{x}</li>)}</ul>
                </div>
              )}
              <p className="mt-3 text-[12px] text-slate-500">
                {[onePager.brief.logistics.city && `Based in ${onePager.brief.logistics.city}`, onePager.brief.logistics.notice && `Notice ${onePager.brief.logistics.notice}`, onePager.brief.logistics.relocation && `Relocation: ${onePager.brief.logistics.relocation}`].filter(Boolean).join(" · ")}
              </p>
            </Section>
          )}

          <Section n={1} title="How they match your brief">
            {reqSummary && (
              <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                <span className="font-semibold">
                  {reqSummary.met} of {reqSummary.total} requirements confirmed
                </span>
                {reqSummary.total - reqSummary.met > 0 && <span className="text-emerald-700/80"> · the rest to confirm on the call</span>}
                {c.share_review?.reviewer_name && (
                  <span className="text-slate-500">
                    {" "}
                    · confirmed by {c.share_review.reviewer_name}
                    {c.share_review.reviewed_at ? ` on ${new Date(c.share_review.reviewed_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                  </span>
                )}
              </p>
            )}
            {fit.rows.length === 0 ? (
              <p className="text-[13px] text-slate-500">This role has no filters to compare against yet.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#ece7de]">
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_28px] gap-3 bg-[#faf8f4] px-3.5 py-2">
                  <span className={LABEL}>You asked for</span>
                  <span className={LABEL}>They have</span>
                  <span />
                </div>
                {fit.rows.map((r) => (
                  <div key={r.key} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_28px] items-start gap-3 border-t border-[#f1ece3] px-3.5 py-2.5 `}>
                    <div>
                      <p className="text-[11px] text-slate-400">{r.label}</p>
                      <p className="text-[13px] text-slate-700">{r.asked}</p>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-slate-900">{r.got}</p>
                      {r.note && <p className="text-[11.5px] text-slate-500">{r.note}</p>}
                    </div>
                    <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${STATE_ICON[r.state].cls}`}>{STATE_ICON[r.state].icon}</span>
                  </div>
                ))}
              </div>
            )}
            {unchecked.length > 0 && (
              <p className="mt-3 text-[12px] text-slate-500">
                <span className="font-medium text-slate-700">Also on your list:</span> {unchecked.join(" · ")}. Your recruiter will confirm these on the call.
              </p>
            )}
          </Section>

          {(headline || highlights.length > 0) && (
            <Section n={2} title="At a glance">
              {headline && <p className="text-[14.5px] font-medium leading-6 text-slate-900">{headline}</p>}
              {highlights.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {highlights.map((h, i) => (
                    <li key={i} className="flex gap-2.5 text-[13px] leading-5 text-slate-700">
                      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8896a]" />
                      {clip(h)}
                    </li>
                  ))}
                </ul>
              )}
              {hasMore && (
                <div className="mt-3">
                  <button type="button" onClick={() => setShowFull((v) => !v)} className="text-[12px] font-medium text-indigo-700 hover:text-indigo-900">
                    {showFull ? "Hide full summary" : "Show full summary"}
                  </button>
                  {showFull && <p className="mt-2 text-[12.5px] leading-6 text-slate-500">{fullSummary}</p>}
                </div>
              )}
            </Section>
          )}

          <Section n={3} title="How they sell">
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Fact label="Sells today" value={(s.sells_now?.length ? s.sells_now : c.sub_domain ? [c.sub_domain] : []).join(", ")} />
              <Fact label="Sales motion" value={(s.motion ?? []).join(", ")} />
              <Fact label="Typical deal size" value={deal ?? null} />
              <Fact label="Quota attainment" value={s.quota ?? s.team_quota} />
              <Fact label="Last year's target" value={target ? `${target}${s.revenue_snapshot?.achievement ? ` · hit ${s.revenue_snapshot.achievement}` : ""}` : null} />
              <Fact label="Selling style" value={s.style} />
              <Fact label="Sells to" value={(s.customer_segment_sold ?? []).join(", ")} />
              <Fact label="Industries" value={(c.industries ?? []).slice(0, 5).join(", ")} />
              <Fact label="Tools" value={tools.join(", ")} />
            </div>
            {!s.sells_now && !s.motion && !deal && !s.quota && !target && tools.length === 0 && (
              <p className="text-[13px] text-slate-500">Selling details will appear here once your recruiter has confirmed them with the candidate.</p>
            )}
          </Section>

          {roles.length > 0 && (
            <Section n={4} title="Experience">
              <div className="space-y-4">
                {roles.slice(0, 6).map((r, i) => {
                  const numbers = [r.quota_or_target && `Target ${r.quota_or_target}`, r.achievement && `Achieved ${r.achievement}`, r.deal_size && `Deals ${r.deal_size}`].filter(Boolean) as string[];
                  return (
                    <div key={i} className="relative border-l-2 border-[#ece7de] pl-4">
                      <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-[#e8896a]" />
                      <p className="text-[14px] font-semibold text-slate-900">{r.title ?? "Role"}</p>
                      <p className="text-[12.5px] text-slate-500">
                        {[r.company, dates(r)].filter(Boolean).join(" · ")}
                      </p>
                      {r.sells && <p className="mt-1 text-[12.5px] text-slate-600">Sold: {r.sells}</p>}
                      {numbers.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {numbers.map((n) => (
                            <Chip key={n} tone="warn">
                              {n}
                            </Chip>
                          ))}
                        </div>
                      )}
                      {r.evidence && <p className="mt-1.5 text-[12.5px] leading-5 text-slate-500">{r.evidence}</p>}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          <Section n={5} title="Details">
            <p className="mb-3 text-[12px] text-slate-500">
              {c.confirmed_on_call_at
                ? `Confirmed by StaffAnchor on a call, ${new Date(c.confirmed_on_call_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.`
                : "As entered by the candidate. Your recruiter can confirm anything that matters to you."}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
              <Fact
                label="Notice period"
                value={
                  c.notice_period ? (
                    <span className="inline-flex items-center gap-1.5">
                      {c.notice_period}
                      {c.verified_notice === "Yes" && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" /> confirmed on call
                        </span>
                      )}
                    </span>
                  ) : null
                }
              />
              <Fact
                label="Open to relocate"
                value={
                  c.open_to_relocation ? (
                    <span className="inline-flex items-center gap-1.5">
                      {c.open_to_relocation}
                      {c.verified_relocation === "Yes" && (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700">
                          <BadgeCheck className="h-3.5 w-3.5" /> confirmed on call
                        </span>
                      )}
                    </span>
                  ) : null
                }
              />
              <Fact label="Current fixed CTC" value={lakhLabel(c.current_fixed_ctc ?? null)} />
              <Fact label="Expected fixed CTC" value={lakhLabel(c.expected_fixed_ctc)} />
              <Fact label="Work mode" value={c.work_mode} />
            </div>
          </Section>
        </div>

        <div className="border-t border-[#ece7de] bg-white px-6 py-4">
          <FeedbackBar candidate={c} onFeedback={onFeedback} />
          {c.shortlisted_at && <p className="mt-2 text-[11px] text-slate-400">Shared with you {formatSlot(c.shortlisted_at)}</p>}
        </div>
      </div>
    </div>
  );
}
