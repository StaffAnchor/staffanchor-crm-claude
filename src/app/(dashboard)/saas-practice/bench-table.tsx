"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, FileText, ExternalLink, UserPlus, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Drawer } from "@/components/ui/drawer";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { TIER_LABEL, TIER_PILL, type ReadinessTier } from "@/lib/readiness";
import { FIT_LABEL, HUNTER_LABEL, gapKeys, gapLabels, isIncomplete, passportTone, segmentLabel, type PassportRow } from "@/lib/saas-passport";
import ResumeViewerInline from "../candidates/[id]/resume-viewer-inline";

const PAGE = 40;
const MAX_ASSIGN = 100;

export type BenchRow = PassportRow & { strongRoles: string[]; openTask: string | null };
type Recruiter = { id: string; name: string };
type Mode = "all" | "needs" | "complete";

function initials(name: string | null) {
  return (name ?? "?").split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-[96px]">
      <p className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-[12.5px] ${value ? "text-slate-800 dark:text-slate-200" : "text-slate-300 dark:text-slate-600"}`}>{value || "Not known"}</p>
    </div>
  );
}

function ctcText(r: PassportRow) {
  const cur = r.current_fixed_ctc != null ? `${Number(r.current_fixed_ctc)} LPA` : null;
  const exp = r.expected_fixed_ctc != null ? `${Number(r.expected_fixed_ctc)} LPA` : null;
  if (cur && exp) return `${cur} → ${exp}`;
  return cur ? `${cur} (expected not asked)` : exp ? `Expects ${exp}` : null;
}

export default function BenchTable({ rows, segmentOptions, recruiters }: { rows: BenchRow[]; segmentOptions: string[]; recruiters: Recruiter[] }) {
  const me = useMyFirstName();
  const [mode, setMode] = useState<Mode>("needs");
  const [q, setQ] = useState("");
  const [fit, setFit] = useState("all");
  const [segment, setSegment] = useState("all");
  const [gap, setGap] = useState("all");
  const [matchOnly, setMatchOnly] = useState(false);
  const [sort, setSort] = useState<"gaps" | "passport" | "experience">("passport");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [note, setNote] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignMsg, setAssignMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [cvFor, setCvFor] = useState<BenchRow | null>(null);
  const [cv, setCv] = useState<{ url: string; fileName: string } | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);

  const counts = useMemo(() => {
    const needs = rows.filter(isIncomplete).length;
    return { all: rows.length, needs, complete: rows.length - needs };
  }, [rows]);

  const gapCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (isIncomplete(r)) for (const g of gapLabels(r)) m.set(g, (m.get(g) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (mode === "needs" && !isIncomplete(r)) return false;
      if (mode === "complete" && isIncomplete(r)) return false;
      if (fit !== "all" && r.practice_fit !== fit) return false;
      if (segment !== "all" && !(r.segments ?? []).includes(segment)) return false;
      if (gap !== "all" && !gapLabels(r).includes(gap)) return false;
      if (matchOnly && r.strongRoles.length === 0) return false;
      if (needle) {
        const hay = `${r.full_name ?? ""} ${r.current_employer ?? ""} ${r.current_job_title ?? ""} ${r.city ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sort === "experience") return Number(b.total_experience_years ?? 0) - Number(a.total_experience_years ?? 0);
      if (sort === "gaps") return gapLabels(a).length - gapLabels(b).length;
      return b.passport_score - a.passport_score;
    });
    return out;
  }, [rows, mode, q, fit, segment, gap, matchOnly, sort]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pickAllFiltered() {
    setPicked(new Set(filtered.filter((r) => !r.openTask && !assigned.has(r.candidate_id)).slice(0, MAX_ASSIGN).map((r) => r.candidate_id)));
  }

  async function assign() {
    if (!assignee || picked.size === 0) return;
    setAssigning(true);
    setAssignMsg(null);
    try {
      const res = await fetch("/api/saas-practice/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateIds: Array.from(picked), recruiterId: assignee, note }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAssignMsg({ ok: false, text: body.error ?? "That didn't work. Try again." });
      } else {
        setAssigned((prev) => new Set([...prev, ...picked]));
        setAssignMsg({
          ok: true,
          text: `${body.created} task${body.created === 1 ? "" : "s"} sent to ${body.assignee ?? "the recruiter"}${body.skipped ? `, ${body.skipped} already had one` : ""}.`,
        });
        setPicked(new Set());
        setNote("");
      }
    } catch {
      setAssignMsg({ ok: false, text: "Network error. Try again." });
    }
    setAssigning(false);
  }

  async function openCv(r: BenchRow) {
    setCvFor(r);
    setCv(null);
    setCvError(null);
    setCvLoading(true);
    try {
      const res = await fetch(`/api/candidates/${r.candidate_id}/cv-url`);
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.url) setCv({ url: body.url, fileName: body.fileName ?? "resume" });
      else setCvError(body.error ?? "The CV could not be opened.");
    } catch {
      setCvError("Network error while opening the CV.");
    }
    setCvLoading(false);
  }

  const select = "rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px]";
  const tab = (m: Mode, label: string, n: number) => (
    <button
      key={m}
      type="button"
      onClick={() => {
        setMode(m);
        setShown(PAGE);
      }}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        mode === m ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
    >
      {label} <span className="opacity-70">{n}</span>
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {tab("needs", "Needs details", counts.needs)}
        {tab("complete", "Ready to use", counts.complete)}
        {tab("all", "Everyone", counts.all)}
      </div>

      {mode === "needs" && gapCounts.length > 0 && (
        <div className="rounded-ros-xl border border-amber-100 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
          <p className="text-[12.5px] text-slate-700 dark:text-slate-300 mb-2">
            <span className="font-medium">What is missing most.</span> Tap one to list those people, then ask a recruiter to collect it.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {gapCounts.slice(0, 9).map(([g, n]) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGap(gap === g ? "all" : g);
                  setShown(PAGE);
                }}
                className={`rounded-full border px-2.5 py-1 text-[12px] ${
                  gap === g ? "border-amber-600 bg-amber-600 text-white" : "border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-100/60 dark:hover:bg-amber-900/30"
                }`}
              >
                {g} · {n}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Name, company, city"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-2 py-1.5 text-[12.5px] w-52"
          />
        </div>
        <select value={fit} onChange={(e) => setFit(e.target.value)} className={select}>
          <option value="all">SaaS and tech</option>
          <option value="saas">SaaS only</option>
          <option value="tech">Other tech only</option>
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} className={select}>
          <option value="all">Any segment sold to</option>
          {segmentOptions.map((s) => (
            <option key={s} value={s}>
              {segmentLabel(s)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={matchOnly} onChange={(e) => setMatchOnly(e.target.checked)} />
          Strong match for an open role
        </label>
        {gap !== "all" && (
          <button type="button" onClick={() => setGap("all")} className="text-[12px] text-blue-600 hover:underline">
            Clear &quot;{gap}&quot;
          </button>
        )}
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={`${select} ml-auto`}>
          <option value="passport">Sort: most complete first</option>
          <option value="gaps">Sort: fewest gaps first</option>
          <option value="experience">Sort: most experienced</option>
        </select>
      </div>

      {/* Ask a recruiter to collect details */}
      <div className="sticky top-2 z-10 rounded-ros-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-3 py-2.5 flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-slate-600 dark:text-slate-300">
          <span className="font-medium">{picked.size}</span> selected
        </span>
        <button type="button" onClick={pickAllFiltered} className="text-[12px] text-blue-600 hover:underline">
          Select the {Math.min(filtered.filter((r) => !r.openTask && !assigned.has(r.candidate_id)).length, MAX_ASSIGN)} shown by the filters
        </button>
        {picked.size > 0 && (
          <button type="button" onClick={() => setPicked(new Set())} className="text-[12px] text-slate-500 hover:underline">
            Clear
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={select}>
            <option value="">Ask who to collect details…</option>
            {recruiters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-[12.5px] w-44"
          />
          <button
            type="button"
            onClick={assign}
            disabled={assigning || !assignee || picked.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
          >
            {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Send as tasks
          </button>
        </div>
        {assignMsg && (
          <p className={`basis-full text-[12.5px] flex items-center gap-1.5 ${assignMsg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>
            {assignMsg.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />} {assignMsg.text}
          </p>
        )}
      </div>

      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
        {filtered.length} of {rows.length} candidates
      </p>

      <ul className="space-y-2">
        {filtered.slice(0, shown).map((r) => {
          const gaps = gapLabels(r);
          const tier = r.readiness_tier as ReadinessTier | null;
          const taskSent = !!r.openTask || assigned.has(r.candidate_id);
          return (
            <li key={r.candidate_id} className="rounded-ros-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5">
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={picked.has(r.candidate_id)}
                  onChange={() => toggle(r.candidate_id)}
                  disabled={taskSent}
                  aria-label={`Select ${r.full_name ?? "candidate"}`}
                  className="mt-1.5 h-4 w-4 shrink-0"
                />
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-[12px] font-semibold text-slate-600 dark:text-slate-300">
                  {initials(r.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/candidates/${r.candidate_id}`} className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 hover:text-blue-600">
                      {r.full_name ?? "Unnamed"}
                    </Link>
                    {r.practice_fit && <Badge tone="accent">{FIT_LABEL[r.practice_fit]}</Badge>}
                    {tier && <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] ring-1 ${TIER_PILL[tier]}`}>{TIER_LABEL[tier]}</span>}
                    <Badge tone={passportTone(r.passport_score)}>Passport {r.passport_score}%</Badge>
                    {taskSent && <Badge tone="info">Details requested</Badge>}
                  </div>
                  <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                    {r.city ? ` · ${r.city}` : ""}
                    {r.total_experience_years != null ? ` · ${Number(r.total_experience_years)} yrs` : ""}
                  </p>

                  <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2">
                    <Fact label="Sells to" value={(r.segments ?? []).map(segmentLabel).join(", ") || null} />
                    <Fact label="Deal size" value={r.deal_size} />
                    <Fact label="Quota" value={r.quota} />
                    <Fact label="Cycle" value={r.sales_cycle} />
                    <Fact label="Style" value={r.hunter_farmer ? HUNTER_LABEL[r.hunter_farmer] : null} />
                    <Fact label="CTC" value={ctcText(r)} />
                    <Fact label="Notice" value={r.notice_period} />
                  </div>

                  {gaps.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-[11.5px] text-slate-500">Ask for:</span>
                      {gaps.map((g) => (
                        <span key={g} className="rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 ring-1 ring-amber-200/70 dark:ring-amber-800/60 px-2 py-0.5 text-[11.5px]">
                          {g}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.strongRoles.length > 0 && (
                    <p className="mt-2 text-[12px] text-emerald-700 dark:text-emerald-400">Strong match for: {r.strongRoles.join(", ")}</p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                  <button
                    type="button"
                    onClick={() => openCv(r)}
                    disabled={!r.has_cv}
                    title={r.has_cv ? "Read the CV here" : "No CV on file"}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-[12px] font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-40 dark:bg-blue-950/40 dark:text-blue-300"
                  >
                    <FileText className="h-3.5 w-3.5" /> CV
                  </button>
                  <WhatsAppMenu
                    phone={r.phone}
                    templates={candidateTemplates(r.full_name, { me, candidateId: r.candidate_id, missing: gapKeys(r) }).filter((t) => t.key !== "intro")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  />
                  <Link
                    href={`/candidates/${r.candidate_id}`}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Profile
                  </Link>
                </div>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="rounded-ros-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-10 text-center text-[13px] text-slate-500">
            Nobody matches these filters.
          </li>
        )}
      </ul>
      {filtered.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[12.5px] hover:bg-slate-50 dark:hover:bg-slate-800">
          Show {Math.min(PAGE, filtered.length - shown)} more
        </button>
      )}

      <Drawer open={!!cvFor} onClose={() => setCvFor(null)} title={cvFor?.full_name ?? "CV"} widthClassName="max-w-3xl">
        {cvFor && (
          <div className="-mx-5 -my-5 flex h-[calc(100vh-3.5rem)] flex-col">
            <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-3 space-y-2">
              <p className="text-[12.5px] text-slate-500">
                {[cvFor.current_job_title, cvFor.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                {cvFor.city ? ` · ${cvFor.city}` : ""}
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Fact label="Sells to" value={(cvFor.segments ?? []).map(segmentLabel).join(", ") || null} />
                <Fact label="Deal size" value={cvFor.deal_size} />
                <Fact label="Quota" value={cvFor.quota} />
                <Fact label="Cycle" value={cvFor.sales_cycle} />
                <Fact label="CTC" value={ctcText(cvFor)} />
                <Fact label="Notice" value={cvFor.notice_period} />
              </div>
              {gapLabels(cvFor).length > 0 && <p className="text-[12px] text-amber-700 dark:text-amber-400">Not on the profile yet: {gapLabels(cvFor).join(", ")}. Check the CV for these.</p>}
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800/50">
              {cvLoading && (
                <div className="flex items-center gap-2 p-6 text-[13px] text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Opening the CV…
                </div>
              )}
              {cvError && <p className="p-6 text-[13px] text-rose-600">{cvError}</p>}
              {cv && <ResumeViewerInline signedUrl={cv.url} fileName={cv.fileName} />}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
