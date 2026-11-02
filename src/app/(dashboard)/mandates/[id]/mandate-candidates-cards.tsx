"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, GraduationCap, Mail, MapPin, Phone, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGES, STAGE_COLOR, applyStageChange, rejectionReasonLabel, type Stage, type StageSource } from "@/lib/mandate-stage";
import type { MandateCandidateRow } from "./mandate-candidates-table";
import type { MandateScreeningContext } from "./mandate-screening-panel";
import type { ApplicationAnswer } from "./application-answers-quick-view";
import ApplicationAnswersQuickView from "./application-answers-quick-view";
import MandateRejectModal from "./mandate-reject-modal";
import ConfirmDetailsModal from "./confirm-details-modal";
import MandateBulkActionsBar from "./mandate-bulk-actions-bar";
import PipelineWhatsApp from "./pipeline-whatsapp";
import OriginChip from "./origin-chip";

const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});
const DONE = ["rejected", "pulled_back"];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "");
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

// The same pipeline as the Table and Board, laid out one person per card: who they are on the left, last jobs and degree in the
// middle, the fit read and the actions on the right. Every stage pill above the list works here as it does everywhere else.
export default function MandateCandidatesCards({
  rows: initialRows,
  mandateContext,
  applicationAnswersByCandidate = {},
  resumeSignedUrlByCandidate = {},
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
  applicationAnswersByCandidate?: Record<string, ApplicationAnswer[]>;
  resumeSignedUrlByCandidate?: Record<string, string>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState(initialRows);
  const [seen, setSeen] = useState(initialRows);
  if (seen !== initialRows) {
    setSeen(initialRows);
    setRows(initialRows);
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [contactOpen, setContactOpen] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [readiness, setReadiness] = useState<Record<string, string[]>>({});
  const [confirmRow, setConfirmRow] = useState<MandateCandidateRow | null>(null);
  const [rejectRow, setRejectRow] = useState<MandateCandidateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const mandateId = mandateContext.mandateId as string;
  const label = `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`;

  const toggle = (set: Set<string>, id: string) => (set.has(id) ? new Set([...set].filter((x) => x !== id)) : new Set(set).add(id));

  async function refreshReadiness(linkIds?: string[]) {
    const ids = linkIds ?? rows.filter((r) => !r.in_shortlist).map((r) => r.id);
    if (ids.length === 0) return;
    const { data } = await supabase.rpc("client_share_blockers_bulk_links", { p_link_ids: ids });
    if (data && typeof data === "object") setReadiness((prev) => ({ ...prev, ...(data as Record<string, string[]>) }));
  }
  useEffect(() => {
    // Load once on mount: the readiness list comes from the database, not from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshReadiness();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markViewed(row: MandateCandidateRow) {
    if (row.viewed_at) return;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, viewed_at: new Date().toISOString() } : r)));
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("candidate_mandate_links").update({ viewed_at: new Date().toISOString(), viewed_by: user?.id ?? null }).eq("id", row.id).is("viewed_at", null);
  }

  async function move(row: MandateCandidateRow, newStage: Stage, source: StageSource = "recruiter", extra: { rejectionCategory?: string; rejectionReason?: string } = {}) {
    setBusy(true);
    setMessage(null);
    try {
      await applyStageChange(supabase, {
        linkId: row.id,
        candidateId: row.candidate.id,
        mandateId,
        candidateName: row.candidate.full_name,
        mandateLabel: label,
        previousStage: row.stage,
        newStage,
        source,
        existingDateOfJoining: row.date_of_joining,
        ...extra,
      });
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, stage: newStage, stage_source: source, ...(newStage === "rejected" ? { rejection_category: extra.rejectionCategory ?? null, rejection_reason: extra.rejectionReason ?? null } : {}) } : r)));
      router.refresh();
    } catch (e) {
      setMessage({ type: "error", text: e instanceof Error ? e.message : "Failed to update stage." });
    } finally {
      setBusy(false);
    }
  }

  // Shortlisting is "put in front of the client": the flag and the stage move together, and missing details open the confirm window.
  async function shortlist(row: MandateCandidateRow): Promise<boolean> {
    setMessage(null);
    const { error } = await supabase.from("candidate_mandate_links").update({ in_shortlist: true }).eq("id", row.id);
    if (error) {
      if (error.message.includes("NOT_CLIENT_READY")) {
        await refreshReadiness([row.id]);
        setConfirmRow(row);
      } else {
        setMessage({ type: "error", text: error.message });
      }
      return false;
    }
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, in_shortlist: true } : r)));
    if ((STAGE_ORDER[row.stage] ?? 0) < STAGE_ORDER["submitted"]) await move(row, "submitted");
    setMessage({ type: "success", text: `${row.candidate.full_name} is now visible to the client.` });
    router.refresh();
    return true;
  }

  function pickStage(row: MandateCandidateRow, next: Stage) {
    if (next === row.stage) return;
    if (next === "rejected") return setRejectRow(row);
    if (next === "submitted" && !row.in_shortlist && (STAGE_ORDER[row.stage] ?? 0) < STAGE_ORDER["submitted"]) return void shortlist(row);
    void move(row, next);
  }

  if (rows.length === 0) return <p className="rounded-ros-xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">No candidates in this stage.</p>;

  return (
    <div>
      {message && (
        <p className={`mb-3 rounded-lg px-3 py-2 text-[13px] ${message.type === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`} role="status">
          {message.text}
        </p>
      )}
      <div className={selected.size > 0 ? "mb-3" : ""}>
        <MandateBulkActionsBar
          rows={rows}
          setRows={setRows}
          selected={selected}
          setSelected={setSelected}
          setMessage={setMessage}
          mandateContext={mandateContext as { mandateId: string; role_title: string; client_name: string; [key: string]: unknown }}
        />
      </div>
      <label className="mb-2 inline-flex items-center gap-2 text-[12.5px] text-slate-500">
        <input type="checkbox" checked={selected.size === rows.length} onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4" />
        Select all {rows.length}
      </label>
      <ul className="space-y-3">
        {rows.map((l) => {
          const c = l.candidate;
          const done = DONE.includes(l.stage);
          const rec = l.match_assessment?.recommendation;
          const edge = done ? "border-l-slate-300" : rec === "Strong Fit" ? "border-l-emerald-500" : rec === "Fit with Reservations" ? "border-l-amber-400" : rec === "Not a Fit" ? "border-l-rose-400" : "border-l-slate-200";
          const answers = applicationAnswersByCandidate[c.id];
          const resumeUrl = resumeSignedUrlByCandidate[c.id];
          const canAct = !["rejected", "pulled_back", "placed"].includes(l.stage);
          const showContact = contactOpen.has(l.id);
          const edu = l.education.filter((e) => e.degree || e.institution).slice(0, 2);
          return (
            <li key={l.id} className={`rounded-ros-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${edge} ${done ? "opacity-75" : ""}`}>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
                {/* Who they are */}
                <div className="min-w-0">
                  <div className="flex items-start gap-3">
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => setSelected((p) => toggle(p, l.id))} aria-label={`Select ${c.full_name}`} className="mt-1.5 h-4 w-4 shrink-0" />
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[13px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">{initials(c.full_name)}</span>
                    <div className="min-w-0">
                      <Link href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" onClick={() => void markViewed(l)} className="block truncate text-[15px] font-semibold text-teal-700 hover:underline dark:text-teal-300">
                        {c.full_name}
                        {!l.viewed_at && ["sourced", "screened"].includes(l.stage) && <span className="ml-1.5 rounded-full bg-teal-600 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-white">New</span>}
                      </Link>
                      <p className="truncate text-[12.5px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || c.category || ""}</p>
                    </div>
                  </div>
                  <dl className="mt-2 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-300">
                    <p><dt className="inline font-semibold">Experience: </dt><dd className="inline">{c.total_experience_years != null ? `${c.total_experience_years} yrs` : "Not given"}</dd></p>
                    <p className="flex items-center gap-1"><MapPin className="h-3 w-3 text-slate-400" /><dt className="inline font-semibold">Location: </dt><dd className="inline">{c.current_location || "Not given"}{c.open_to_relocation ? ` · relocation ${c.open_to_relocation.toLowerCase()}` : ""}</dd></p>
                    <p><dt className="inline font-semibold">{l.origin === "applied" ? "Applied on: " : "Added on: "}</dt><dd className="inline">{fmtDate(l.created_at)}</dd></p>
                    <p><dt className="inline font-semibold">Notice period: </dt><dd className="inline">{c.notice_period || "Not given"}</dd></p>
                    {c.current_fixed_ctc != null && <p><dt className="inline font-semibold">Current CTC: </dt><dd className="inline">{c.current_fixed_ctc} LPA</dd></p>}
                  </dl>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                    <OriginChip origin={l.origin} label={l.origin_label} />
                    {answers && answers.length > 0 && (
                      <ApplicationAnswersQuickView answers={answers}>
                        <span className="cursor-pointer text-sky-700 hover:underline">Screening questions ({answers.length})</span>
                      </ApplicationAnswersQuickView>
                    )}
                    {l.call_paid_at && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" title="Paid ₹199 for a recruiter call">Paid call{l.call_due_at ? ` · due ${fmtDate(l.call_due_at)}` : ""}</span>}
                    {l.client_feedback && (
                      <span className={`rounded-full px-2 py-0.5 font-medium ${l.client_feedback === "not_interested" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
                        Client: {l.client_feedback.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Last jobs */}
                <div className="min-w-0 space-y-2 text-[13px]">
                  {l.last_roles.length === 0 ? (
                    <p className="text-slate-400">Job history not read yet.</p>
                  ) : (
                    l.last_roles.map((r, i) => (
                      <div key={i}>
                        <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{r.company || "Company not given"}</p>
                        <p className="truncate text-slate-500">{r.title}</p>
                        <p className="text-slate-400">{r.period}</p>
                      </div>
                    ))
                  )}
                  <Link href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" onClick={() => void markViewed(l)} className="text-[12.5px] text-sky-700 hover:underline">Full profile and timeline</Link>
                </div>

                {/* Education */}
                <div className="min-w-0 space-y-2 text-[13px]">
                  {edu.length === 0 ? (
                    <p className="text-slate-400">Education not read yet.</p>
                  ) : (
                    edu.map((e, i) => (
                      <div key={i} className="flex gap-1.5">
                        <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{e.institution || e.degree}</p>
                          <p className="truncate text-slate-500">{e.institution ? e.degree : ""}</p>
                          {e.year && <p className="text-slate-400">{e.year}</p>}
                        </div>
                      </div>
                    ))
                  )}
                  {(c.stability_score != null || c.sub_domain) && (
                    <p className="text-[12.5px] text-slate-500">{[c.sub_domain, c.stability_score != null ? `Stability ${c.stability_score}` : null].filter(Boolean).join(" · ")}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex min-w-[210px] flex-col gap-2 md:items-stretch">
                  <div className="flex items-center gap-2">
                    <select
                      value={l.stage}
                      disabled={busy}
                      onChange={(e) => pickStage(l, e.target.value as Stage)}
                      aria-label={`Stage for ${c.full_name}`}
                      className={`h-8 min-w-0 flex-1 rounded-full border-0 px-2.5 text-xs font-medium capitalize ${STAGE_COLOR[l.stage] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                      ))}
                    </select>
                    {l.stage === "rejected" && l.rejection_category && (
                      <span className="text-[11.5px] text-slate-500" title={l.rejection_reason ?? undefined}>{rejectionReasonLabel((l.stage_source as "recruiter" | "client_relayed") ?? "recruiter", l.rejection_category)}</span>
                    )}
                  </div>
                  {canAct && (
                    <div className="grid grid-cols-2 gap-2">
                      {l.in_shortlist ? (
                        <span className="inline-flex h-9 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-[13px] font-semibold text-emerald-700">With client</span>
                      ) : (
                        <button type="button" onClick={() => void shortlist(l)} className="h-9 rounded-lg border border-teal-600 text-[13px] font-semibold text-teal-700 hover:bg-teal-50" title="Show this person to the client and move them to Submitted">
                          {rec === "Not a Fit" ? "Send anyway" : "Shortlist"}
                        </button>
                      )}
                      <button type="button" onClick={() => setRejectRow(l)} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-rose-300 text-[13px] font-semibold text-rose-700 hover:bg-rose-50">
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button type="button" onClick={() => { setContactOpen((p) => toggle(p, l.id)); void markViewed(l); }} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
                      <Eye className="h-3.5 w-3.5" /> {showContact ? "Hide contact" : "View contact details"}
                    </button>
                    <PipelineWhatsApp
                      candidateId={c.id}
                      candidateName={c.full_name}
                      phone={c.phone}
                      missing={c.readiness_missing}
                      stage={l.stage}
                      roleTitle={mandateContext.role_title ?? null}
                      cities={(mandateContext.cities as string[] | undefined) ?? null}
                      workMode={(mandateContext.work_mode as string | null | undefined) ?? null}
                    />
                  </div>
                  {resumeUrl ? (
                    <a href={resumeUrl} target="_blank" rel="noopener noreferrer" onClick={() => void markViewed(l)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-teal-600 text-[13px] font-medium text-teal-700 hover:bg-teal-50">
                      <Download className="h-3.5 w-3.5" /> Download resume
                    </a>
                  ) : (
                    <span className="inline-flex h-9 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[12.5px] text-slate-400">No resume on file</span>
                  )}
                </div>
              </div>

              {showContact && (
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/60">
                  {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 font-medium text-teal-700"><Phone className="h-3.5 w-3.5" /> {c.phone}</a> : <span className="text-slate-400">No phone</span>}
                  {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 font-medium text-teal-700"><Mail className="h-3.5 w-3.5" /> {c.email}</a> : <span className="text-slate-400">No email</span>}
                </div>
              )}

              {/* Fit read, same sentence the Table shows */}
              {l.match_assessment && (
                <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-[12.5px] dark:border-slate-700">
                  <span className={`mr-2 font-semibold ${rec === "Strong Fit" ? "text-emerald-700" : rec === "Not a Fit" ? "text-rose-700" : "text-amber-700"}`}>{rec}</span>
                  {l.match_assessment.positives[0] && <span className="mr-3 text-slate-600 dark:text-slate-300">✓ {l.match_assessment.positives[0]}</span>}
                  {(l.match_assessment.red_flags[0] || l.match_assessment.missing[0]) && <span className="text-slate-500">⚠ {l.match_assessment.red_flags[0] ?? `Missing: ${l.match_assessment.missing[0]}`}</span>}
                </div>
              )}
              {(l.candidate.readiness_missing?.length ?? 0) > 0 && !l.in_shortlist && (readiness[l.id]?.length ?? 0) > 0 && (
                <p className="mt-2 text-[12px] text-amber-700">Before sending to the client: {readiness[l.id].join(", ")}</p>
              )}
            </li>
          );
        })}
      </ul>

      {confirmRow && (
        <ConfirmDetailsModal
          linkId={confirmRow.id}
          mandateId={mandateId}
          candidateId={confirmRow.candidate.id}
          candidateName={confirmRow.candidate.full_name}
          blockers={readiness[confirmRow.id] ?? []}
          onRecheck={() => refreshReadiness([confirmRow.id])}
          onShare={() => shortlist(confirmRow)}
          onClose={() => setConfirmRow(null)}
        />
      )}
      {rejectRow && (
        <MandateRejectModal
          candidateName={rejectRow.candidate.full_name}
          candidateId={rejectRow.candidate.id}
          mandateId={mandateId}
          submitting={busy}
          onCancel={() => setRejectRow(null)}
          onConfirm={async (result) => {
            const row = rejectRow;
            await move(row, "rejected", result.source, { rejectionCategory: result.category, rejectionReason: result.note || undefined });
            setRejectRow(null);
          }}
        />
      )}
    </div>
  );
}
