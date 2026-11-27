"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileUp, MessageCircle, Mic, Phone, Layers, Star, ClipboardList } from "lucide-react";
import PaidCallBadge from "@/components/paid-call-badge";
import type { PaidCall } from "@/lib/paid-calls";
import { sourceChannelLabel } from "@/lib/candidate-source-label";
import CandidatePanel, { type PanelFocus } from "./candidate-panel";
import type { CandidateRow, MandateLink, OpenMandate, SourceJob } from "./candidates-table";

// The compact People list: who they are, whether they fit, where they came from, and one next step.
// Keys: j / k move, Enter opens, x selects, w opens WhatsApp, / goes to search, Esc closes the panel.

export type LastCall = { at: string; outcome: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });
const lakh = (n: number | null | undefined) => (n && Number(n) > 0 ? `₹${Number(Number(n).toFixed(1))}L` : null);
const OUTCOME: Record<string, string> = { reached: "spoke", no_answer: "no answer", call_later: "call later", not_interested: "not interested", wrong_number: "wrong number" };

export function waHref(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}

function nextStep(c: CandidateRow & { resume_file_url?: string | null }, paid: PaidCall | undefined, lastCall: LastCall | undefined): { label: string; focus: PanelFocus; Icon: typeof Phone; strong: boolean } {
  if (paid && paid.state !== "called") return { label: "Call now", focus: "call", Icon: Phone, strong: true };
  if (!c.resume_file_url) return { label: "Ask for CV", focus: "ask", Icon: FileUp, strong: false };
  if (!c.current_fixed_ctc) return { label: "Ask details", focus: "ask", Icon: ClipboardList, strong: false };
  if (lastCall && (c.role_fit?.suggested_count ?? 0) > 0) return { label: "Add to role", focus: "role", Icon: Layers, strong: false };
  return { label: "Call", focus: "call", Icon: Phone, strong: false };
}

export default function CandidateList({
  candidates,
  selected,
  onToggle,
  onToggleAll,
  fromQS,
  openMandates,
  mandateLinksByCandidate,
  sourceJobByCandidate,
  paidCalls,
  voiceIds,
  poolLabels,
  lastCalls,
}: {
  candidates: CandidateRow[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  fromQS: string;
  openMandates: OpenMandate[];
  mandateLinksByCandidate: Record<string, MandateLink[]>;
  sourceJobByCandidate: Record<string, SourceJob>;
  paidCalls: Record<string, PaidCall>;
  voiceIds: string[];
  poolLabels: Record<string, string>;
  lastCalls: Record<string, LastCall>;
}) {
  const [open, setOpen] = useState<{ id: string; focus: PanelFocus } | null>(null);
  const [cursor, setCursor] = useState(-1);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const close = useCallback(() => setOpen(null), []);
  const profileHref = (id: string) => (fromQS ? `/candidates/${id}?from=${encodeURIComponent(fromQS)}` : `/candidates/${id}`);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || open) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (e.key === "/") {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[name="q"]')?.focus();
        return;
      }
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        const next = Math.min(candidates.length - 1, Math.max(0, cursor + (e.key === "j" ? 1 : -1)));
        setCursor(next);
        rows.current[next]?.scrollIntoView({ block: "nearest" });
        return;
      }
      const c = candidates[cursor];
      if (!c) return;
      if (e.key === "Enter" && t?.tagName !== "BUTTON" && t?.tagName !== "A") {
        e.preventDefault();
        setOpen({ id: c.id, focus: "overview" });
      } else if (e.key === "x") {
        onToggle(c.id);
      } else if (e.key === "w") {
        const href = waHref(c.phone);
        if (href) window.open(href, "_blank", "noopener");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [candidates, cursor, open, onToggle]);

  const current = open ? candidates.find((c) => c.id === open.id) : undefined;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-[12px] text-slate-500 dark:border-slate-800">
        <input type="checkbox" aria-label="Select all on this page" checked={selected.size > 0 && selected.size === candidates.length} onChange={onToggleAll} className="rounded accent-teal-600" />
        <span className="flex-1">Select all on this page</span>
        <span className="hidden md:inline">Keys: j / k move · Enter open · x select · w WhatsApp · / search</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {candidates.map((c, i) => {
          const paid = paidCalls[c.id];
          const last = lastCalls[c.id];
          const job = c.created_by === "quick_apply" ? sourceJobByCandidate[c.id] : undefined;
          const ratio = c.current_fixed_ctc && Number(c.current_fixed_ctc) > 0 && Number(c.total_experience_years) >= 1 ? Number(c.current_fixed_ctc) / Number(c.total_experience_years) : null;
          const step = nextStep(c, paid, last);
          const wa = waHref(c.phone);
          const links = mandateLinksByCandidate[c.id] ?? [];
          const fits = c.role_fit?.suggested_count ?? 0;
          const pay = [lakh(c.current_fixed_ctc) ?? "Pay not given", lakh(c.expected_fixed_ctc) ? `→ ${lakh(c.expected_fixed_ctc)}` : null].filter(Boolean).join(" ");
          return (
            <div
              key={c.id}
              ref={(el) => {
                rows.current[i] = el;
              }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a,button,input")) return;
                setCursor(i);
                setOpen({ id: c.id, focus: "overview" });
              }}
              className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 px-4 py-3 md:grid-cols-[auto_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] ${selected.has(c.id) ? "bg-teal-50 dark:bg-teal-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/60"} ${cursor === i ? "ring-2 ring-inset ring-teal-500/50" : ""}`}
            >
              <input type="checkbox" aria-label={`Select ${c.full_name}`} checked={selected.has(c.id)} onChange={() => onToggle(c.id)} className="rounded accent-teal-600" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Link href={profileHref(c.id)} className="truncate text-[15px] font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100">
                    {c.full_name}
                  </Link>
                  {paid && <PaidCallBadge call={paid} compact />}
                  {voiceIds.includes(c.id) && <Mic className="h-3.5 w-3.5 shrink-0 text-teal-600" aria-label="Has a voice note" />}
                  {poolLabels[c.id] && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-1.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <Star className="h-3 w-3" /> {poolLabels[c.id]}
                    </span>
                  )}
                  {!c.resume_file_url && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">No CV</span>}
                </div>
                <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">
                  {[c.current_job_title, c.current_employer, c.current_location].filter(Boolean).join(" · ") || "No work details yet"}
                </p>
              </div>
              <div className="col-start-2 min-w-0 md:col-start-auto">
                <p className="truncate text-[14px] tabular-nums text-slate-800 dark:text-slate-200">
                  {pay}
                  {ratio !== null && (
                    <span className={`ml-1.5 text-[12px] ${ratio >= 1.5 ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-slate-400"}`} title="Current pay in lakhs divided by years of experience. 1.5 or more is the bar for the top tier.">
                      ratio {ratio.toFixed(1)}
                    </span>
                  )}
                </p>
                <p className="truncate text-[12px] text-slate-500">
                  {[c.total_experience_years != null ? `${Number(c.total_experience_years)} yrs` : null, c.notice_period ? (c.notice_period === "Immediate" ? "Immediate" : `${c.notice_period} notice`) : null].filter(Boolean).join(" · ") || "Experience and notice not given"}
                </p>
              </div>
              <div className="col-start-2 min-w-0 md:col-start-auto">
                <p className="truncate text-[13px] text-slate-700 dark:text-slate-300" title={job ? `${job.role_title} at ${job.client_name}` : undefined}>
                  {job ? `Applied: ${job.role_title}` : c.created_by ? sourceChannelLabel(c.created_by, null) : "Source unknown"}
                </p>
                <p className="truncate text-[12px] text-slate-500">
                  {day(c.created_at)}, {time(c.created_at)}
                  {last ? ` · called ${day(last.at)}${last.outcome ? ` (${OUTCOME[last.outcome] ?? last.outcome})` : ""}` : " · not called"}
                  {links.length ? ` · on ${links.length} role${links.length > 1 ? "s" : ""}` : fits ? ` · fits ${fits} open role${fits > 1 ? "s" : ""}` : ""}
                </p>
              </div>
              <div className="col-start-2 flex items-center gap-1.5 md:col-start-auto md:justify-end">
                {wa && (
                  <a href={wa} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-300" title="Opens WhatsApp. You type and send it yourself." aria-label={`WhatsApp ${c.full_name}`}>
                    <MessageCircle className="h-4 w-4" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCursor(i);
                    setOpen({ id: c.id, focus: step.focus });
                  }}
                  className={`inline-flex w-[128px] items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold ${step.strong ? "bg-amber-500 text-white hover:bg-amber-600" : "border border-slate-200 text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                >
                  <step.Icon className="h-3.5 w-3.5" /> {step.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {current && open && (
        <CandidatePanel
          key={current.id}
          c={current}
          focus={open.focus}
          onClose={close}
          profileHref={profileHref(current.id)}
          openMandates={openMandates}
          links={mandateLinksByCandidate[current.id] ?? []}
          paid={paidCalls[current.id]}
        />
      )}
    </div>
  );
}
