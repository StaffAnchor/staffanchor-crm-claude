"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Mic, ChevronDown, ChevronUp, GraduationCap, Inbox, Mail, MessageCircle, MoreHorizontal, PanelRightClose, PanelRightOpen, Phone, PhoneCall, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { passReasonLabel } from "@/components/client-view/PassReasonDialog";
import { STAGES, STAGE_COLOR, applyStageChange, rejectionReasonLabel, type Stage, type StageSource } from "@/lib/mandate-stage";
import type { MandateCandidateRow } from "./candidate-row";
import type { MandateScreeningContext } from "./mandate-screening-panel";
import type { ApplicationAnswer } from "./application-answers-quick-view";
import MandateRejectModal from "./mandate-reject-modal";
import { ConfirmDetailsPanel } from "./confirm-details-modal";
import MandateBulkActionsBar from "./mandate-bulk-actions-bar";
import PipelineWhatsApp from "./pipeline-whatsapp";
import { SkillsStrip } from "@/components/candidate-facts-strip";
import ResumePreview from "../../candidates/[id]/resume-preview";
import { leadSourceOf } from "@/lib/lead-source";
import { FactTile, NextStep, ScoreRing } from "@/components/pipeline-ui";
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

// The same pipeline as the Table and Board, laid out one person per card: who they are on the left, last jobs and degree in the
// middle, the fit read and the actions on the right. Every stage pill above the list works here as it does everywhere else.
const stabilityRead = (n: number) => (n >= 70 ? { word: "Stable", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" } : n >= 50 ? { word: "Some job hopping", cls: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" } : { word: "Frequent job changes", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" });

// The few things a recruiter must not miss on a card: who rejected and why, what the client said, stability, and any voice note.
function KeyFacts({ l, voice, wa }: { l: MandateCandidateRow; voice?: { url: string; seconds: number | null; transcript: string | null; at: string; thisRole: boolean; role: string | null }; wa?: { id: string; at: string; count: number } }) {
  const c = l.candidate;
  const stab = c.stability_score != null ? Math.round(Number(c.stability_score)) : null;
  const sr = stab != null ? stabilityRead(stab) : null;
  const clientPassed = l.client_feedback === "not_interested" || !!l.client_pass_reason;
  const rejectedByClient = l.stage === "rejected" && (l.stage_source === "client_relayed" || clientPassed);
  const clientReason = passReasonLabel(l.client_pass_reason) ?? (l.rejection_category ? rejectionReasonLabel("client_relayed", l.rejection_category) : null);
  const ourReason = l.rejection_category ? rejectionReasonLabel("recruiter", l.rejection_category) : null;
  const when = l.client_decision_at ?? l.stage_updated_at;
  const dateText = when ? new Date(when).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
  const hasAnything = l.stage === "rejected" || !!l.client_feedback || sr || voice || wa;
  if (!hasAnything) return null;
  return (
    <div className="space-y-2.5">
      {l.stage === "rejected" && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">{rejectedByClient ? "Rejected by the client" : "Rejected by us"}{dateText ? ` · ${dateText}` : ""}{l.rejected_from_stage ? ` · was at ${l.rejected_from_stage.replace(/_/g, " ")}` : ""}</p>
          <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">{(rejectedByClient ? clientReason ?? ourReason : ourReason ?? clientReason) ?? "No reason was recorded"}</p>
          {(l.client_pass_note || l.rejection_reason) && <p className="mt-1 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">{l.client_pass_note ? `Client note: \u201c${l.client_pass_note}\u201d` : l.rejection_reason}</p>}
          {l.client_pass_note && l.rejection_reason && l.rejection_reason !== l.client_pass_note && <p className="mt-1 text-[12.5px] text-slate-500">{l.rejection_reason}</p>}
        </div>
      )}
      {l.stage !== "rejected" && l.client_feedback && (
        <div className={`rounded-2xl border p-4 ${clientPassed ? "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30" : "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30"}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${clientPassed ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>{l.client_feedback === "not_interested" ? "Client passed" : l.client_feedback === "interview_requested" ? "Client wants an interview" : "Client shortlisted"}{dateText ? ` · ${dateText}` : ""}</p>
          {clientPassed && <p className="mt-1 text-[14px] font-semibold text-slate-900 dark:text-slate-100">{clientReason ?? "No reason given"}</p>}
          {(l.client_pass_note || l.client_note) && <p className="mt-1 text-[13px] text-slate-700 dark:text-slate-300">&ldquo;{l.client_pass_note ?? l.client_note}&rdquo;</p>}
        </div>
      )}
      {(sr || wa) && (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          {sr && stab != null && <span className={`rounded-full px-2.5 py-1 font-semibold ${sr.cls}`} title="Out of 100, read from how long they stayed in each job">Stability {stab}/100 · {sr.word}</span>}
          {wa && <Link href={`/candidates/${c.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2.5 py-1 font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-200"><Mic className="h-3.5 w-3.5" /> {wa.count > 1 ? `${wa.count} WhatsApp voice notes` : "WhatsApp voice note"}</Link>}
        </div>
      )}
      {voice && (
        <div className="rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900 dark:bg-teal-950/30">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-200"><Mic className="h-3.5 w-3.5" /> {voice.thisRole ? "Why they say they suit this role" : `Voice note from another role${voice.role ? `: ${voice.role}` : ""}`}{voice.seconds ? ` · ${voice.seconds}s` : ""}</p>
          <audio controls preload="none" src={voice.url} className="mt-2 h-10 w-full" />
          {voice.transcript ? <p className="mt-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">&ldquo;{voice.transcript}&rdquo; <span className="text-[11px] text-slate-400">English text, translated if needed</span></p> : <p className="mt-2 text-[12px] text-slate-400">Written version still being prepared.</p>}
        </div>
      )}
    </div>
  );
}

export default function MandateCandidatesCards({
  rows: initialRows,
  mandateContext,
  applicationAnswersByCandidate = {},
  resumeSignedUrlByCandidate = {},
  voiceByCandidate = {},
  waVoiceByCandidate = {},
}: {
  rows: MandateCandidateRow[];
  mandateContext: MandateScreeningContext & { [key: string]: unknown };
  applicationAnswersByCandidate?: Record<string, ApplicationAnswer[]>;
  resumeSignedUrlByCandidate?: Record<string, string>;
  voiceByCandidate?: Record<string, { url: string; seconds: number | null; transcript: string | null; at: string; thisRole: boolean; role: string | null }>;
  waVoiceByCandidate?: Record<string, { id: string; at: string; count: number }>;
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
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "details" | "share" | "answers">("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [readiness, setReadiness] = useState<Record<string, string[]>>({});
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
        setActiveId(row.id);
        setTab("details");
        setMobileOpen(true);
        setMessage({ type: "error", text: `${row.candidate.full_name}: finish the call and details first, then share.` });
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


  const recOf = (l: MandateCandidateRow) => l.match_assessment?.recommendation;
  const rankOf = (l: MandateCandidateRow) => (DONE.includes(l.stage) ? 3 : recOf(l) === "Strong Fit" ? 0 : recOf(l) === "Fit with Reservations" ? 1 : recOf(l) === "Not a Fit" ? 3 : 2);
  const needle = q.trim().toLowerCase();
  const searched = needle ? rows.filter((l) => [l.candidate.full_name, l.candidate.current_employer, l.candidate.current_job_title, l.candidate.current_location].filter(Boolean).join(" ").toLowerCase().includes(needle)) : rows;
  const grouped = GROUPS.map((g) => ({ ...g, rows: searched.filter((l) => rankOf(l) === g.rank).sort((a, b) => (b.match_score ?? -1) - (a.match_score ?? -1)) })).filter((g) => g.rows.length > 0);
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

  const ago = (iso: string | null) => {
    if (!iso) return "";
    const d = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
    return d <= 0 ? "today" : d < 14 ? `${d}d` : d < 60 ? `${Math.floor(d / 7)}w` : `${Math.floor(d / 30)}mo`;
  };
  // A call counts as logged once we remember something they said, or the details are complete.
  const callLogged = (l: MandateCandidateRow) => !!readMemory(l.candidate.segment_data) || detailsState(l).done;

  // The line under the facts: what we remember from a call, else the first gap, else the first plus, else where they came from.
  function lineThree(l: MandateCandidateRow): { text: string; cls: string } {
    const m = readMemory(l.candidate.segment_data);
    if (m && (m.wants.length || m.dealbreakers.length || m.summary)) {
      const bits = [m.wants[0] ? `wants ${m.wants[0].toLowerCase()}` : "", m.dealbreakers[0] ? `no ${m.dealbreakers[0].toLowerCase()}` : ""].filter(Boolean);
      return { text: `Spoke ${m.at ? fmtDate(m.at) : "earlier"}: ${bits.length ? bits.join(" · ") : m.summary}`, cls: "text-sky-700 dark:text-sky-300" };
    }
    const a = l.match_assessment;
    const gap = a?.red_flags[0] ?? (a?.missing[0] ? `Missing: ${a.missing[0]}` : null);
    if (gap) return { text: gap, cls: "text-amber-700 dark:text-amber-400" };
    if (a?.positives[0]) return { text: a.positives[0], cls: "text-emerald-700 dark:text-emerald-400" };
    const src = leadSourceOf(l.candidate, l.origin, l.origin_label, l.uploader_name);
    return { text: `${src.label}${src.detail ? ` · ${src.detail}` : ""}`, cls: "text-slate-400" };
  }

  function renderRow(l: MandateCandidateRow, activeRowId: string | null) {
    const c = l.candidate;
    const done = DONE.includes(l.stage);
    const rank = rankOf(l);
    const ds = detailsState(l);
    const l3 = lineThree(l);
    const src = leadSourceOf(c, l.origin, l.origin_label, l.uploader_name);
    const isActive = activeRowId === l.id;
    const facts = [
      c.total_experience_years != null ? `${c.total_experience_years} yrs` : null,
      c.current_fixed_ctc != null || c.expected_fixed_ctc != null ? `${c.current_fixed_ctc ?? "—"} → ${c.expected_fixed_ctc ?? "—"} LPA` : null,
      c.notice_period || null,
      c.current_location || null,
    ];
    return (
      <li key={l.id} className={`border-b border-slate-100 last:border-b-0 dark:border-slate-800 ${isActive ? "bg-teal-50 shadow-[inset_4px_0_0_0] shadow-teal-600 dark:bg-teal-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"} ${done ? "opacity-70" : ""}`}>
        <div className="flex items-start gap-2 px-3 py-3">
          <input type="checkbox" checked={selected.has(l.id)} onChange={() => setSelected((p) => toggle(p, l.id))} aria-label={`Select ${c.full_name}`} className="mt-3 h-3.5 w-3.5 shrink-0 accent-teal-600" />
          <button
            type="button"
            onClick={() => { setActiveId(l.id); setMobileOpen(true); void markViewed(l); }}
            aria-current={isActive}
            title={`${c.full_name}: ${src.label}${src.detail ? ` · ${src.detail}` : ""}`}
            className="grid min-w-0 flex-1 grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 text-left"
          >
            <span title={l.match_assessment?.recommendation ?? "Fit not read yet"}><ScoreRing score={l.match_score != null ? Math.round(l.match_score) : null} rank={rank} /></span>
            <span className="min-w-0">
              <span className="flex items-baseline gap-1.5">
                <span className="max-w-[68%] shrink-0 truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{c.full_name}</span>
                {!l.viewed_at && ["sourced", "screened"].includes(l.stage) && <span className="shrink-0 rounded-full bg-teal-600 px-1.5 text-[9.5px] font-semibold text-white">New</span>}
                {voiceByCandidate[c.id] && <span className="shrink-0 text-teal-600" title="Added a voice note with the application"><Mic className="h-3.5 w-3.5" /></span>}
                <span className="min-w-0 flex-1 truncate text-[12px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" · ") || c.category || ""}</span>
              </span>
              <span className="mt-0.5 block truncate text-[12px] tabular-nums text-slate-500">{facts.filter(Boolean).join(" · ") || "No facts yet"}</span>
              <span className={`mt-0.5 block truncate text-[12px] ${l3.cls}`} title={l3.text}>{l3.text}</span>
            </span>
            <span className="flex flex-col items-end gap-1">
              {canActRow(l) && (
                <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${ds.done ? "bg-emerald-600 text-white" : "border-[1.5px] border-amber-500"}`} title={ds.title}>
                  {ds.done ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
              )}
              <span className="text-[11px] text-slate-400">{ago(l.created_at)}</span>
            </span>
          </button>
        </div>
      </li>
    );
  }
  const canActRow = (l: MandateCandidateRow) => !["rejected", "pulled_back", "placed"].includes(l.stage);

  function renderPane(l: MandateCandidateRow) {
    const c = l.candidate;
    const rec = recOf(l);
    const answers = applicationAnswersByCandidate[c.id];
    const resumeUrl = resumeSignedUrlByCandidate[c.id];
    const canAct = canActRow(l);
    const edu = l.education.filter((e) => e.degree || e.institution).slice(0, 2);
    const src = leadSourceOf(c, l.origin, l.origin_label, l.uploader_name);
    const memory = readMemory(c.segment_data);
    const ds = detailsState(l);
    const logged = callLogged(l);
    const a = l.match_assessment;
    const fact = (label: string, value: string | null | undefined) => <FactTile label={label} value={value} />;
    // What they told us on other roles' application questions, saved on the profile for every later role.
    const savedAnswers = ((c.segment_data as { application_answers?: Record<string, { q?: string; a?: unknown; mandate_id?: string; at?: string }> } | null)?.application_answers) ?? {};
    const earlierAnswers = Object.values(savedAnswers).filter((x) => x?.q && x.mandate_id !== mandateId && x.a != null && x.a !== "");
    const voice = voiceByCandidate[c.id];
    const tabs: { key: "overview" | "details" | "share" | "answers"; label: string; dot?: boolean }[] = [
      { key: "overview", label: "Overview" },
      ...(canAct ? [{ key: "details" as const, label: "Call & details", dot: !ds.done }, { key: "share" as const, label: l.in_shortlist ? "With client" : "Share with client" }] : []),
      ...((answers && answers.length > 0) || earlierAnswers.length > 0 ? [{ key: "answers" as const, label: `Answers (${(answers?.length ?? 0) + earlierAnswers.length})` }] : []),
    ];
    const curTab = tabs.some((t) => t.key === tab) ? tab : "overview";
    const left = readiness[l.id];
    const toConfirm = [...(left ?? []).map((x) => x.replace(/^Recruiter confirmation.*$/, "Call and confirm details")), ...(a?.missing ?? []).map((x) => x.replace(/ \(confirm on call\)/, ""))].filter((x, i, arr) => arr.indexOf(x) === i).slice(0, 4);
    const next: { tone: "go" | "warn" | "stop" | "info"; title: string; detail?: string; actions?: React.ReactNode } | null = !canAct
      ? null
      : l.in_shortlist
        ? { tone: "go", title: l.client_feedback ? `Client feedback: ${l.client_feedback.replace(/_/g, " ")}` : "With the client. Waiting for their feedback.", detail: l.client_feedback ? undefined : "Follow up if you hear nothing in a few days." }
        : rec === "Not a Fit" && !memory
          ? { tone: "stop", title: "Probably not a fit", detail: a?.red_flags[0] ?? "The fit read says no. If you think the data is wrong, call and confirm.", actions: (<><button type="button" onClick={() => setRejectRow(l)} className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-rose-700">Reject</button><button type="button" onClick={() => setTab("details")} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-slate-700">Call anyway</button></>) }
          : !logged
            ? { tone: "info", title: "Call them first", detail: toConfirm.length ? `Confirm: ${toConfirm.join(" · ")}` : "No call on record yet.", actions: <button type="button" onClick={() => setTab("details")} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Open the call form</button> }
            : !ds.done
              ? { tone: "warn", title: `${left?.length ?? "A few"} thing${left?.length === 1 ? "" : "s"} left before you can share`, detail: toConfirm.join(" · ") || undefined, actions: <button type="button" onClick={() => setTab("details")} className="rounded-lg bg-amber-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Finish details</button> }
              : { tone: "go", title: "Ready to share with the client", detail: "The call and every detail the client needs are done.", actions: <button type="button" onClick={() => void shortlist(l)} className="rounded-lg bg-teal-600 px-3 py-1.5 text-[12.5px] font-semibold text-white">Share with client</button> };
    return (
      <div className="flex min-h-0 flex-col">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
          <button type="button" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[12.5px] lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> List</button>
          <ScoreRing score={l.match_score != null ? Math.round(l.match_score) : null} rank={rankOf(l)} size={52} />
          <div className="min-w-[180px] flex-1">
            <Link href={`/candidates/${c.id}`} target="_blank" rel="noopener noreferrer" onClick={() => void markViewed(l)} className="text-[20px] font-semibold leading-tight tracking-tight text-slate-900 hover:underline dark:text-slate-100">{c.full_name}</Link>
            <p className="truncate text-[12.5px] text-slate-500">{[c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || c.category || ""}</p>
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" title="Where this person came from">
              <Inbox className="h-3 w-3" /> {src.label}{src.detail ? ` · ${src.detail}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={l.stage} disabled={busy} onChange={(e) => pickStage(l, e.target.value as Stage)} aria-label={`Stage for ${c.full_name}`} className={`h-8 min-w-[110px] rounded-full border-0 px-2.5 text-xs font-medium capitalize ${STAGE_COLOR[l.stage] ?? "bg-slate-100 text-slate-700"}`}>
              {STAGES.map((s) => (<option key={s} value={s}>{s.replace(/_/g, " ")}</option>))}
            </select>
            {canAct && (l.in_shortlist ? (
              <span className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[12.5px] font-semibold text-emerald-700">With client</span>
            ) : rec === "Not a Fit" ? (
              <button type="button" onClick={() => setRejectRow(l)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-rose-300 px-3 text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50"><X className="h-3.5 w-3.5" /> Reject</button>
            ) : logged ? (
              <button type="button" onClick={() => void shortlist(l)} className="inline-flex h-8 items-center rounded-lg bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700" title="Show this person to the client and move them to submitted">Share with client</button>
            ) : (
              <button type="button" onClick={() => { setTab("details"); void markViewed(l); }} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[12.5px] font-semibold text-white hover:bg-teal-700" title="Open the call form and the phone number"><PhoneCall className="h-3.5 w-3.5" /> Call now</button>
            ))}
            {canAct && (
              <PipelineWhatsApp candidateId={c.id} candidateName={c.full_name} phone={c.phone} missing={c.readiness_missing} stage={l.stage} roleTitle={mandateContext.role_title ?? null} cities={(mandateContext.cities as string[] | undefined) ?? null} workMode={(mandateContext.work_mode as string | null | undefined) ?? null} />
            )}
            {canAct && (
              <RowMenu label={`More actions for ${c.full_name}`}>
                {!l.in_shortlist && rec === "Not a Fit" && <MenuItem onClick={() => void shortlist(l)}>Send to client anyway</MenuItem>}
                {!l.in_shortlist && rec !== "Not a Fit" && <MenuItem onClick={() => setRejectRow(l)} danger>Reject</MenuItem>}
                {l.in_shortlist && <MenuItem onClick={() => setRejectRow(l)} danger>Reject</MenuItem>}
                {!l.in_shortlist && logged && <MenuItem onClick={() => setTab("details")}>Call &amp; details</MenuItem>}
                {resumeUrl && <MenuItem href={resumeUrl} download onClick={() => void markViewed(l)}>Download CV</MenuItem>}
                <MenuItem href={`/candidates/${c.id}`}>Full profile and timeline</MenuItem>
              </RowMenu>
            )}
          </div>
        </div>

        <div role="tablist" className="flex gap-0.5 overflow-x-auto border-b border-slate-100 px-4 dark:border-slate-800">
          {tabs.map((t) => (
            <button key={t.key} role="tab" type="button" aria-selected={curTab === t.key} onClick={() => setTab(t.key)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] ${curTab === t.key ? "border-teal-600 font-semibold text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
              {t.label}{t.dot && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>

        </div>
        <div className="min-h-0 flex-1 space-y-4 p-5">
          {next && curTab !== "share" && <NextStep tone={next.tone} title={next.title} detail={next.detail}>{next.actions}</NextStep>}
          <KeyFacts l={l} voice={voice} wa={waVoiceByCandidate[c.id]} />
          {curTab === "overview" && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {fact("Experience", c.total_experience_years != null ? `${c.total_experience_years} yrs` : null)}
                {fact("Location", c.current_location ? `${c.current_location}${c.open_to_relocation ? (c.open_to_relocation === "Yes" ? ", will relocate" : c.open_to_relocation === "No" ? ", will not relocate" : ", may relocate") : ""}` : null)}
                {fact("Notice", c.notice_period)}
                {fact("Current", c.current_fixed_ctc != null ? `${c.current_fixed_ctc} LPA` : null)}
                {fact("Expected", c.expected_fixed_ctc != null ? `${c.expected_fixed_ctc} LPA` : null)}
                {fact(l.origin === "applied" ? "Applied" : "Added", fmtDate(l.created_at))}
              </dl>

              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Why this fit</p>
                {a ? (
                  <div className="space-y-3 text-[13px]">
                    <span className={`inline-block rounded-md px-2 py-0.5 text-[12px] font-semibold ${rec === "Strong Fit" ? "bg-emerald-50 text-emerald-700" : rec === "Not a Fit" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}>{rec}</span>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Going for them</p>
                        {a.positives.length === 0 && <p className="text-slate-400">Nothing yet.</p>}
                        {a.positives.slice(0, 5).map((x) => (<p key={x} className="flex gap-1.5 text-slate-700 dark:text-slate-300"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {x}</p>))}
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">To check</p>
                        {a.red_flags.length + a.missing.length === 0 && <p className="text-slate-400">Nothing to flag.</p>}
                        {[...a.red_flags, ...a.missing.map((m) => `Missing: ${m}`)].slice(0, 6).map((x) => (<p key={x} className="flex gap-1.5 text-slate-700 dark:text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" /> {x}</p>))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-slate-400">Not read yet.</p>
                )}
              </div>

              <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">What we remember from calls</p>
                {memory ? (
                  <div className="space-y-1.5 text-[13px]">
                    {memory.summary && <p className="text-slate-700 dark:text-slate-300"><span className="font-medium">Spoke {memory.at ? fmtDate(memory.at) : "earlier"}:</span> {memory.summary}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {memory.wants.map((w) => (<span key={w} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">Wants: {w}</span>))}
                      {memory.dealbreakers.map((w) => (<span key={w} className="rounded-full bg-rose-50 px-2 py-0.5 text-[12px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">Will not accept: {w}</span>))}
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[13px] text-slate-400"><MessageCircle className="h-3.5 w-3.5" /> Nothing yet. After a call, what they said shows here and feeds matching.</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[12px]">
                {l.call_paid_at && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800" title="Paid ₹199 for a recruiter call">Paid call{l.call_due_at ? ` · due ${fmtDate(l.call_due_at)}` : ""}</span>}
              </div>

              <div className="grid gap-4 text-[13px] sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Last jobs</p>
                  {l.last_roles.length === 0 ? <p className="text-slate-400">Job history not read yet.</p> : l.last_roles.map((r, i) => (
                    <div key={i}><p className="truncate font-semibold text-slate-900 dark:text-slate-100">{r.company || "Company not given"}</p><p className="truncate text-slate-500">{r.title}</p><p className="text-slate-400">{r.period}</p></div>
                  ))}
                </div>
                <div className="min-w-0 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Education</p>
                  {edu.length === 0 ? <p className="text-slate-400">Education not read yet.</p> : edu.map((e, i) => (
                    <div key={i} className="flex gap-1.5"><GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /><div className="min-w-0"><p className="truncate font-semibold text-slate-900 dark:text-slate-100">{e.institution || e.degree}</p><p className="truncate text-slate-500">{e.institution ? e.degree : ""}</p>{e.year && <p className="text-slate-400">{e.year}</p>}</div></div>
                  ))}
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
                ) : <span className="text-slate-400">No resume on file</span>}
              </div>
            </div>
          )}

          {curTab === "details" && canAct && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] dark:bg-slate-800/60">
                <span className="text-slate-600 dark:text-slate-300">Fill this in whenever you speak to them, before or after sharing. The client sees the profile only when it is complete.</span>
                {c.phone ? <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 font-semibold text-white"><Phone className="h-3.5 w-3.5" /> {c.phone}</a> : <span className="text-slate-400">No phone</span>}
              </div>
              {((mandateContext.must_haves as string[] | undefined) ?? []).length > 0 && (
                <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Ask about, from the JD</p>
                  <div className="flex flex-wrap gap-1.5">
                    {((mandateContext.must_haves as string[]) ?? []).slice(0, 8).map((m) => (<span key={m} className="rounded-full bg-slate-100 px-2.5 py-1 text-[12px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">{m}</span>))}
                  </div>
                  <p className="mt-2 text-[12px] text-slate-400">The review below marks each of these. Notes you write, in English or Hindi, are translated and remembered for matching.</p>
                </div>
              )}
              <ConfirmDetailsPanel
                key={l.id}
                roleCluster={(mandateContext.role_cluster as string | null | undefined) ?? null}
                mandateContext={mandateContext}
                linkId={l.id}
                mandateId={mandateId}
                candidateId={c.id}
                blockers={readiness[l.id] ?? []}
                onRecheck={async () => { await refreshReadiness([l.id]); router.refresh(); }}
              />
            </div>
          )}

          {curTab === "share" && canAct && (
            <div className="space-y-4">
              {l.in_shortlist ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-[13.5px] text-emerald-900">
                  <p className="font-semibold">With the client</p>
                  <p className="mt-0.5">{l.client_feedback ? `Their feedback: ${l.client_feedback.replace(/_/g, " ")}${l.client_note ? `. "${l.client_note}"` : ""}` : "No feedback yet. Follow up if it has been a few days."}</p>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Before the client sees this person</p>
                    {left === undefined ? <p className="text-[13px] text-slate-400">Checking…</p> : left.length === 0 ? (
                      <p className="flex items-center gap-2 text-[13.5px] font-medium text-emerald-700"><Check className="h-4 w-4" /> Everything the client needs is filled in.</p>
                    ) : (
                      <ul className="space-y-1.5 text-[13px]">
                        {left.map((x) => (<li key={x} className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />{x.startsWith("Recruiter confirmation") ? "Call them and confirm the details" : x}</li>))}
                      </ul>
                    )}
                  </div>
                  <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">What the client will see</p>
                    <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                      {fact("Role now", [c.current_job_title, c.current_employer].filter(Boolean).join(" at ") || null)}
                      {fact("Experience", c.total_experience_years != null ? `${c.total_experience_years} yrs` : null)}
                      {fact("Location", c.current_location || null)}
                      {fact("Current", c.current_fixed_ctc != null ? `${c.current_fixed_ctc} LPA` : null)}
                      {fact("Expected", c.expected_fixed_ctc != null ? `${c.expected_fixed_ctc} LPA` : null)}
                      {fact("Notice", c.notice_period)}
                    </dl>
                    <p className="mt-2 text-[12px] text-slate-400">Plus your review of each must-have for this role.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={!ds.done || !logged} onClick={() => void shortlist(l)} className="inline-flex h-9 items-center rounded-lg bg-teal-600 px-4 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50">Share with client</button>
                    {(!ds.done || !logged) && <button type="button" onClick={() => setTab("details")} className="text-[13px] font-medium text-teal-700 hover:underline">Finish the call and details first</button>}
                  </div>
                </>
              )}
            </div>
          )}

          {curTab === "answers" && (
            <div className="space-y-5">
              {(answers?.length ?? 0) > 0 && <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">This role&apos;s questions</p>}
            <ul className="space-y-3 text-[13px]">
              {(answers ?? []).map((x, i) => (<li key={i}><p className="font-medium text-slate-800 dark:text-slate-100">{x.question_text}</p><p className="text-slate-600 dark:text-slate-300">{x.answer_text ?? (x.answer_number != null ? String(x.answer_number) : x.answer_bool != null ? (x.answer_bool ? "Yes" : "No") : "—")}</p></li>))}
            </ul>
              {earlierAnswers.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Saved from earlier applications</p>
                  <ul className="space-y-3 text-[13px]">
                    {earlierAnswers.map((x, i) => (<li key={i}><p className="font-medium text-slate-800 dark:text-slate-100">{x.q}</p><p className="text-slate-600 dark:text-slate-300">{typeof x.a === "boolean" ? (x.a ? "Yes" : "No") : String(x.a)}</p></li>))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  const visible = grouped.filter((g) => !isCollapsed(g.key)).flatMap((g) => g.rows);
  const activeRow = rows.find((r) => r.id === activeId) ?? visible[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (t?.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = visible.findIndex((r) => r.id === activeRow?.id);
      if ((e.key === "j" || e.key === "ArrowDown") && visible[i + 1]) { e.preventDefault(); setActiveId(visible[i + 1].id); }
      if ((e.key === "k" || e.key === "ArrowUp") && i > 0) { e.preventDefault(); setActiveId(visible[i - 1].id); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  function toggleWide() {
    const next = !wide;
    setWide(next);
    window.dispatchEvent(new CustomEvent("mandate-panel-collapse", { detail: { collapsed: next } }));
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
      <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] text-slate-500">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={selected.size === rows.length} onChange={() => setSelected(selected.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))} className="h-4 w-4" />
          Select all {rows.length}
        </label>
        <span className="hidden items-center gap-3 lg:inline-flex">
          <span className="text-slate-400">J / K or arrows to move</span>
          <button type="button" onClick={toggleWide} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[12px] hover:bg-slate-50 dark:border-slate-700" title="Hide the role details column to get more room">
            {wide ? <PanelRightOpen className="h-3.5 w-3.5" /> : <PanelRightClose className="h-3.5 w-3.5" />} {wide ? "Show role details" : "More room"}
          </button>
        </span>
      </div>

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(350px,430px)_minmax(0,1fr)]">
        <div className={`${mobileOpen ? "hidden lg:block" : ""} overflow-hidden rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
          <div className="sticky top-0 z-[2] border-b border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, city" aria-label="Search this list" className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[13px] outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800" />
          </div>
          {grouped.length === 0 && <p className="p-6 text-center text-[13px] text-slate-400">No one matches that search.</p>}
          {grouped.map((g) => {
            const closed = isCollapsed(g.key);
            return (
              <section key={g.key}>
                {showHeaders && (
                  <button type="button" onClick={() => flipGroup(g.key)} aria-expanded={!closed} className="sticky top-[49px] z-[1] flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-900">
                    <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${g.key === "strong" ? "bg-emerald-500" : g.key === "reservations" ? "bg-amber-500" : g.key === "notfit" ? "bg-rose-400" : "bg-slate-300"}`} />{g.label}</span>
                    <span className="inline-flex items-center gap-1 tabular-nums">{g.rows.length} {closed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</span>
                  </button>
                )}
                {!closed && <ul>{g.rows.map((l) => renderRow(l, activeRow?.id ?? null))}</ul>}
              </section>
            );
          })}
        </div>

        <div className={`${mobileOpen ? "" : "hidden lg:block"} rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-3 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
          {activeRow ? renderPane(activeRow) : <p className="p-10 text-center text-sm text-slate-400">Pick someone from the list.</p>}
        </div>
      </div>

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
