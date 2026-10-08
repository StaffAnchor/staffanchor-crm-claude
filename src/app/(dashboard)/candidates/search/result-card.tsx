"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, HelpCircle, Minus, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import ResumePreview from "../[id]/resume-preview";
import AskMissingDetails from "../[id]/ask-missing-details";
import type { Check as CheckRow } from "@/lib/search-spec";

export type Match = {
  candidate_id: string;
  full_name: string;
  score: number;
  reason: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  current_fixed_ctc: number | null;
  expected_fixed_ctc: number | null;
  notice_period: string | null;
  sub_domain: string | null;
  practices: { name: string; seniority_band: string }[];
  resume_file_url: string | null;
  resume_signed_url: string | null;
  checks: CheckRow[];
  missing: string[];
};

export type MandateOption = { id: string; role_title: string; city: string | null };

const SENIORITY: Record<string, string> = { ic: "IC", team_lead: "Team Lead", manager: "Manager", director: "Director", vp_plus: "VP & above" };

const STATUS_STYLE: Record<CheckRow["status"], { cls: string; icon: React.ReactNode; word: string }> = {
  met: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800", icon: <Check className="h-3 w-3" />, word: "Meets" },
  near: { cls: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-800", icon: <Minus className="h-3 w-3" />, word: "Close" },
  unknown: { cls: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700", icon: <HelpCircle className="h-3 w-3" />, word: "Check on a call" },
  not_met: { cls: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-800", icon: <X className="h-3 w-3" />, word: "Doesn't meet" },
};

const lakh = (v: number | null) => (v === null || v === undefined ? null : `${v} LPA`);

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-[88px]">
      <div className="text-[10.5px] uppercase tracking-wide text-slate-400">{label}</div>
      {value ? <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{value}</div> : <div className="text-[12px] text-amber-600">Not on file</div>}
    </div>
  );
}

export default function ResultCard({ m, mandates, mandateId }: { m: Match; mandates: MandateOption[]; mandateId: string | null }) {
  const [target, setTarget] = useState(mandateId ?? "");
  const [state, setState] = useState<"idle" | "adding" | "added" | "exists" | "error">("idle");
  const [open, setOpen] = useState(false);
  const tone = m.score >= 75 ? "success" : m.score >= 50 ? "warning" : "neutral";

  async function add() {
    if (!target) return;
    setState("adding");
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_mandate_links").insert({
      candidate_id: m.candidate_id,
      mandate_id: target,
      added_by: user?.id ?? null,
      match_score: m.score,
      match_source: "prompt_search",
      matched_at: new Date().toISOString(),
    });
    if (!error) setState("added");
    else setState(error.code === "23505" ? "exists" : "error");
  }

  const target_ = mandates.find((x) => x.id === target);

  return (
    <Card className="p-4 transition-colors duration-200 hover:border-indigo-300 dark:hover:border-indigo-700">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link href={`/candidates/${m.candidate_id}`} className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{m.full_name}</p>
            <Badge tone={tone}>{m.score}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-slate-500 dark:text-slate-400">{[m.current_job_title, m.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</p>
        </Link>
        {m.resume_signed_url && (
          <ResumePreview signedUrl={m.resume_signed_url} fileName={(m.resume_file_url ?? `${m.full_name}-resume`).replace(/^resumes\//, "")} label="CV" />
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
        <Fact label="City" value={m.current_location} />
        <Fact label="Experience" value={m.total_experience_years !== null ? `${m.total_experience_years} yrs` : null} />
        <Fact label="Current CTC" value={lakh(m.current_fixed_ctc)} />
        <Fact label="Expected CTC" value={lakh(m.expected_fixed_ctc)} />
        <Fact label="Notice" value={m.notice_period} />
      </div>

      {m.reason && <p className="mt-2.5 text-[12.5px] leading-snug text-slate-700 dark:text-slate-300">{m.reason}</p>}

      {m.checks.length > 0 && (
        <div className="mt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {m.checks.map((c) => (
              <span key={c.key} title={c.evidence} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ${STATUS_STYLE[c.status].cls}`}>
                {STATUS_STYLE[c.status].icon}
                {c.label}
              </span>
            ))}
          </div>
          <button onClick={() => setOpen(!open)} className="mt-1.5 text-[11.5px] font-medium text-indigo-600 hover:underline">
            {open ? "Hide the evidence" : "Show the evidence"}
          </button>
          {open && (
            <ul className="mt-1 space-y-0.5 text-[12px] text-slate-600 dark:text-slate-300">
              {m.checks.map((c) => (
                <li key={c.key}>
                  <span className="font-medium">{c.label}:</span> {STATUS_STYLE[c.status].word}. {c.evidence}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {m.practices.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {m.practices.map((p) => (
            <Badge key={p.name} tone="neutral" size="sm" className="normal-case tracking-normal">
              {p.name} · {SENIORITY[p.seniority_band] ?? p.seniority_band}
            </Badge>
          ))}
        </div>
      )}

      <AskMissingDetails candidateId={m.candidate_id} missing={m.missing.filter((l) => l !== "CV")} />

      {mandates.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          {state === "added" ? (
            <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> Added to {target_?.role_title ?? "the mandate"}
            </span>
          ) : state === "exists" ? (
            <span className="text-[12px] font-medium text-slate-500">Already in that mandate&apos;s pipeline</span>
          ) : (
            <>
              {!mandateId && (
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="max-w-[240px] rounded-md border border-slate-300 bg-transparent px-2 py-1 text-[12px] dark:border-slate-700">
                  <option value="">Add to a mandate…</option>
                  {mandates.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.role_title}
                      {x.city ? ` · ${x.city}` : ""}
                    </option>
                  ))}
                </select>
              )}
              <button onClick={add} disabled={!target || state === "adding"} className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-[12px] font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
                <Plus className="h-3 w-3" /> {state === "adding" ? "Adding…" : mandateId ? `Add to ${target_?.role_title ?? "mandate"}` : "Add"}
              </button>
              {state === "error" && <span className="text-[12px] text-rose-600">Couldn&apos;t add. Try again.</span>}
            </>
          )}
        </div>
      )}
    </Card>
  );
}
