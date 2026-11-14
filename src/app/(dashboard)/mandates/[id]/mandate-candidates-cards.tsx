"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, GraduationCap, Inbox, Mail, MessageCircle, MoreHorizontal, Phone, PhoneCall, X } from "lucide-react";
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
import { SkillsStrip } from "@/components/candidate-facts-strip";
import ResumePreview from "../../candidates/[id]/resume-preview";
import { leadSourceOf } from "@/lib/lead-source";
import { readMemory } from "@/lib/call-memory";

const STAGE_ORDER = STAGES.reduce<Record<string, number>>((acc, s, i) => ({ ...acc, [s]: i }), {});
const DONE = ["rejected", "pulled_back"];
const GROUPS = [
  { rank: 0, key: "strong", label: "Strong fit" },
  { rank: 1, key: "reservations", label: "Fit with reservations" },
  { rank: 2, key: "unread", label: "No fit read yet" },
  { rank: 3, key: "notfit", label: "Not a fit" },
];

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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [confirmMode, setConfirmMode] = useState<"share" | "details">("share");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [readiness, setReadiness] = useState<Record<string, string[]>>({});
  const [confirmRow, setConfirmRow] = useState<MandateCandidateRow | null>(null);
  const [rejectRow, setRejectRow] = useState<MandateCandidateRow | null>(null);
  const [busy, setBusy] = useState(false);
  const mandateId = mandateContext.mandateId as string;
  const label = `${mandateContext.role_title as string} — ${mandateContext.client_name as string}`;
  // What the role asks for, so the skills that match it are marked on every card.
  const roleText = [mandateContext.role_title as string, ...(((mandateContext.must_haves as string[] | undefined) ?? []).slice(0, 8))].filter(Boolean).join(" ");

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
        setConfirmMode("share");
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

  const recOf = (l: MandateCandidateRow) => l.match_assessment?.recommendation;
  const rankOf = (l: MandateCandidateRow) => (DONE.includes(l.stage) ? 3 : recOf(l) === "Strong Fit" ? 0 : recOf(l) === "Fit with Reservations" ? 1 : recOf(l) === "Not a Fit" ? 3 : 2);
  const grouped = GROUPS.map((g) => ({ ...g, rows: rows.filter((l) => rankOf(l) === g.rank).sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1)) })).filter((g) => g.rows.length > 0);
  const showHeaders = grouped.length > 1;
  const isCollapsed = (key: string) => (collapsedGroups.has(key) ? !collapsedGroups.has(`open:${key}`) || false : key === "notfit" && showHeaders && !collapsedGroups.has(`open:${key}`));
  const flipGroup = (key: string) =>
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      const closed = isCollapsed(key);
      next.delete(key);
      next.delete(`open:${key}`);
      next.add(closed ? `open:${key}` : key);
      return next;
    });

  // "Call & details": done when nothing the client needs is still open; otherwise how many things remain.
  function detailsState(l: MandateCandidateRow): { done: boolean; text: string; title: string } {
    if (l.in_shortlist) return { done: true, text: "Call & details", title: "Complete: this person is with the client" };
    const left = readiness[l.id];
    if (left === undefined) return { done: false, text: "Call & details", title: "Checking what is still needed" };
    if (left.length === 0) return { done: true, text: "Call & details", title: "Everything the client needs is filled in" };
    return { done: false, text: `Call & details · ${left.length} to do`, title: `Still needed: ${left.join(", ")}` };
  }

  function renderRow(l: MandateCandidateRow) {
    const c = l.candidate;
    const done = DONE.includes(l.stage);
    const rec = recOf(l);
    const edge = done ? "border-l-slate-300" : rec === "Strong Fit" ? "border-l-emerald-500" : rec === "Fit with Reservations" ? "border-l-amber-400" : rec === "Not a Fit" ? "border-l-rose-400" : "border-l-slate-200";
    const answers = applicationAnswersByCandidate[c.id];
    const resumeUrl = resumeSignedUrlByCandidate[c.id];
    const canAct = !["rejected", "pulled_back", "placed"].includes(l.stage);
    const edu = l.education.filter((e) => e.degree || e.institution).slice(0, 2);
    const isOpen = expanded.has(l.id);
    const src = leadSourceOf(c, l.origin, l.origin_label);
    const memory = readMemory(c.segment_data);
    const ds = detailsState(l);
    const fit = recOf(l);
    const fact = (label: string, value: string | null | undefined) => (
      <span className="whitespace-nowrap">
        <span className="text-slate-400">{label} </span>
        <span className={value ? "font-medium text-slate-700 dark:text-slate-200" : "text-slate-300"}>{value || "—"}</span>
      </span>
    );
    return (
      <li key={l.id} className={`rounded-ros-xl border border-l-4 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${edge} ${done ? "opacity-75" : ""}`}>
        <div className="grid gap-3 p-3.5 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 items-start gap-3">
            <input type="checkbox" checked={selected.has(l.id)} onChange={() => setSelected((p) => toggle(p, l.id))} aria-label={`Select ${c.full_name}`} className="mt-2 h-4 w-4 shrink-0" />
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[13px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">{initials(c.full_name)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Link href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" onClick={() => void markViewed(l)} className="truncate text-[15px] font-semibold text-teal-700 hover:underline dark:text-teal-300">
                  {c.full_name}
                </Link>
                {!l.viewed_at && ["sourced", "screened"].includes(l.stage) && <span className="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">New</span>}
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="Where this person came from">
                  <Inbox className="h-3 w-3" /> {src.label}{src.detail ? ` · ${src.detail}` : ""}
                </span>
              </div>
              <p className="truncate text-[12.5px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || c.category || ""}</p>

              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[12.5px]">
                {fact("Experience", c.total_experience_years != null ? `${c.total_experience_years} yrs` : null)}
                {fact("Location", c.current_location ? `${c.current_location}${c.open_to_relocation ? (c.open_to_relocation === "Yes" ? ", will relocate" : c.open_to_relocation === "No" ? ", will not relocate" : ", may relocate") : ""}` : null)}
                {fact("Notice", c.notice_period)}
                {fact("Current", c.current_fixed_ctc != null ? `${c.current_fixed_ctc} LPA` : null)}
                {fact("Expected", c.expected_fixed_ctc != null ? `${c.expected_fixed_ctc} LPA` : null)}
                {fact(l.origin === "applied" ? "Applied" : "Added", fmtDate(l.created_at))}
              </p>

              {l.match_assessment && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                  <span className={`rounded-md px-2 py-0.5 text-[12px] font-semibold ${fit === "Strong Fit" ? "bg-emerald-50 text-emerald-700" : fit === "Not a Fit" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{fit}</span>
                  {l.match_assessment.positives[0] && <span className="text-slate-600 dark:text-slate-300">✓ {l.match_assessment.positives[0]}</span>}
                  {(l.match_assessment.red_flags[0] || l.match_assessment.missing[0]) && <span className="text-slate-500">⚠ {l.match_assessment.red_flags[0] ?? `Missing: ${l.match_assessment.missing[0]}`}</span>}
                </p>
              )}

              {memory?.summary && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[12.5px] leading-snug text-slate-500 dark:text-slate-400">
                  <MessageCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><span className="font-medium text-slate-600 dark:text-slate-300">Spoke {memory.at ? fmtDate(memory.at) : "earlier"}:</span> {memory.summary}</span>
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                {answers && answers.length > 0 && (
                  <ApplicationAnswersQuickView answers={answers}>
                    <span className="cursor-pointer text-sky-700 hover:underline">Screening answers ({answers.length})</span>
                  </ApplicationAnswersQuickView>
                )}
                {l.call_paid_at && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" title="Paid ₹199 for a recruiter call">Paid call{l.call_due_at ? ` · due ${fmtDate(l.call_due_at)}` : ""}</span>}
                {l.client_feedback && (
                  <span className={`rounded-full px-2 py-0.5 font-medium ${l.client_feedback === "not_interested" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>Client: {l.client_feedback.replace(/_/g, " ")}</span>
                )}
                {l.stage === "rejected" && l.rejection_category && (
                  <span className="text-slate-500" title={l.rejection_reason ?? undefined}>{rejectionReasonLabel((l.stage_source as "recruiter" | "client_relayed") ?? "recruiter", l.rejection_category)}</span>
                )}
                <button type="button" onClick={() => { setExpanded((p) => toggle(p, l.id)); void markViewed(l); }} aria-expanded={isOpen} className="inline-flex items-center gap-1 font-medium text-teal-700 hover:underline">
                  {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} {isOpen ? "Hide details" : "Jobs, education, skills, contact"}
                </button>
              </div>
            </div>
          </div>

          {/* One line of actions: stage, the call and details, the main action, the rest in the menu */}
          <div className="flex flex-wrap items-start justify-start gap-2 md:min-w-[250px] md:flex-col md:items-stretch">
            <select
              value={l.stage}
              disabled={busy}
              onChange={(e) => pickStage(l, e.target.value as Stage)}
              aria-label={`Stage for ${c.full_name}`}
              className={`h-8 min-w-[120px] rounded-full border-0 px-2.5 text-xs font-medium capitalize ${STAGE_COLOR[l.stage] ?? "bg-slate-100 text-slate-700"}`}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
            {canAct && (
              <button
                type="button"
                onClick={() => { setConfirmMode("details"); setConfirmRow(l); void markViewed(l); }}
                title={ds.title}
                className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-semibold ${ds.done ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"}`}
              >
                {ds.done ? <Check className="h-3.5 w-3.5" /> : <PhoneCall className="h-3.5 w-3.5" />} {ds.text}
              </button>
            )}
            {canAct && (
              <div className="flex items-center gap-2">
                {l.in_shortlist ? (
                  <span className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-[12.5px] font-semibold text-emerald-700">With client</span>
                ) : rec === "Not a Fit" ? (
                  <button type="button" onClick={() => setRejectRow(l)} className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-rose-300 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                ) : (
                  <button type="button" onClick={() => void shortlist(l)} className="inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-teal-600 text-[12.5px] font-semibold text-teal-700 hover:bg-teal-50" title="Show this person to the client and move them to submitted">Shortlist</button>
                )}
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
                <RowMenu label={`More actions for ${c.full_name}`}>
                  {!l.in_shortlist && rec === "Not a Fit" && <MenuItem onClick={() => void shortlist(l)}>Send to client anyway</MenuItem>}
                  {!l.in_shortlist && rec !== "Not a Fit" && <MenuItem onClick={() => setRejectRow(l)} danger>Reject</MenuItem>}
                  {l.in_shortlist && <MenuItem onClick={() => setRejectRow(l)} danger>Reject</MenuItem>}
                  <MenuItem onClick={() => { setExpanded((p) => new Set(p).add(l.id)); void markViewed(l); }}>View contact details</MenuItem>
                  {resumeUrl && <MenuItem href={resumeUrl} download onClick={() => void markViewed(l)}>Download CV</MenuItem>}
                  <MenuItem href={`/candidates/${c.id}`}>Full profile and timeline</MenuItem>
                </RowMenu>
              </div>
            )}
          </div>
        </div>

        {isOpen && (
          <div className="space-y-3 border-t border-slate-100 px-3.5 py-3 dark:border-slate-800">
            <div className="grid gap-4 text-[13px] md:grid-cols-2">
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last jobs</p>
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
              </div>
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Education</p>
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
                {(c.stability_score != null || c.sub_domain) && <p className="text-[12.5px] text-slate-500">{[c.sub_domain, c.stability_score != null ? `Stability ${c.stability_score}` : null].filter(Boolean).join(" · ")}</p>}
              </div>
            </div>
            <SkillsStrip candidateId={c.id} roleText={roleText} />
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/60">
              {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 font-medium text-teal-700"><Phone className="h-3.5 w-3.5" /> {c.phone}</a> : <span className="text-slate-400">No phone</span>}
              {c.email ? <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 font-medium text-teal-700"><Mail className="h-3.5 w-3.5" /> {c.email}</a> : <span className="text-slate-400">No email</span>}
              {resumeUrl ? (
                <span className="inline-flex [&>button]:h-8 [&>button]:rounded-lg [&>button]:border [&>button]:border-teal-600 [&>button]:bg-white [&>button]:px-3 [&>button]:text-[12.5px]">
                  <ResumePreview signedUrl={resumeUrl} fileName={(c.resume_file_url ?? `${c.full_name}-resume`).replace(/^resumes\//, "")} label="Preview CV" candidateId={c.id} onOpen={() => void markViewed(l)} />
                </span>
              ) : (
                <span className="text-slate-400">No resume on file</span>
              )}
            </div>
            {(l.candidate.readiness_missing?.length ?? 0) > 0 && !l.in_shortlist && (readiness[l.id]?.length ?? 0) > 0 && <p className="text-[12px] text-amber-700">Before sending to the client: {readiness[l.id].join(", ")}</p>}
          </div>
        )}
      </li>
    );
  }

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
      <div className="space-y-4">
        {grouped.map((g) => {
          const closed = isCollapsed(g.key);
          return (
            <section key={g.key}>
              {showHeaders && (
                <button type="button" onClick={() => flipGroup(g.key)} aria-expanded={!closed} className="mb-2 flex w-full items-center gap-2 text-left text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">
                  {closed ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronUp className="h-4 w-4 text-slate-400" />}
                  {g.label} <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800">{g.rows.length}</span>
                  {closed && <span className="font-normal text-slate-400">show</span>}
                </button>
              )}
              {!closed && <ul className="space-y-2.5">{g.rows.map((l) => renderRow(l))}</ul>}
            </section>
          );
        })}
      </div>

      {confirmRow && (
        <ConfirmDetailsModal
          mode={confirmMode}
          linkId={confirmRow.id}
          mandateId={mandateId}
          candidateId={confirmRow.candidate.id}
          candidateName={confirmRow.candidate.full_name}
          roleCluster={(mandateContext.role_cluster as string | null | undefined) ?? null}
          mandateContext={mandateContext}
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

// The small "more actions" menu on a row.
function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" onClick={() => setOpen(false)} className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-[13px] shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, href, download, danger }: { children: React.ReactNode; onClick?: () => void; href?: string; download?: boolean; danger?: boolean }) {
  const cls = `block w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${danger ? "text-rose-700" : "text-slate-700 dark:text-slate-200"}`;
  if (href) {
    return (
      <a role="menuitem" href={href} download={download} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}
