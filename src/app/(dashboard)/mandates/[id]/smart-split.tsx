"use client";

import { useState } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, HelpCircle, Minus, Phone, PhoneCall, Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CvButtons } from "@/components/candidate-card-layout";
import { SkillsStrip } from "@/components/candidate-facts-strip";
import { FactTile, NextStep, ScoreRing } from "@/components/pipeline-ui";
import AskMissingDetails from "../../candidates/[id]/ask-missing-details";
import CandidateCallPanel from "./candidate-call-panel";
import type { Match } from "../../candidates/search/result-card";
import type { Check as CheckRow } from "@/lib/search-spec";

type Group = { key: string; title: string; blurb: string; items: Match[] };

const STATUS: Record<CheckRow["status"], { cls: string; icon: React.ReactNode; word: string }> = {
  met: { cls: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300", icon: <Check className="h-3 w-3" />, word: "Meets" },
  near: { cls: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300", icon: <Minus className="h-3 w-3" />, word: "Close" },
  unknown: { cls: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300", icon: <HelpCircle className="h-3 w-3" />, word: "Check on a call" },
  not_met: { cls: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300", icon: <X className="h-3 w-3" />, word: "Doesn't meet" },
};
const lakh = (v: number | null) => (v === null || v === undefined ? null : `${v} LPA`);

// The Smart tab's results in the same split view as the Pipeline and Matches: one line per person on the left, the full card on the right.
export default function SmartSplit({ groups, roleId, roleTitle, roleCluster = null }: { groups: Group[]; roleId: string; roleTitle: string; roleCluster?: string | null }) {
  const all = groups.flatMap((g) => g.items);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "call">("overview");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Record<string, "adding" | "added" | "exists" | "error">>({});
  const [showEvidence, setShowEvidence] = useState(false);

  const needle = q.trim().toLowerCase();
  const matches = (m: Match) => !needle || [m.full_name, m.current_employer, m.current_job_title, m.current_location].filter(Boolean).join(" ").toLowerCase().includes(needle);
  const visible = groups.filter((g) => !closed.has(g.key)).flatMap((g) => g.items.filter(matches));
  const active = all.find((m) => m.candidate_id === activeId) ?? visible[0] ?? null;

  async function add(m: Match) {
    setAdded((a) => ({ ...a, [m.candidate_id]: "adding" }));
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("candidate_mandate_links").insert({ candidate_id: m.candidate_id, mandate_id: roleId, added_by: user?.id ?? null, match_score: m.score, match_source: "prompt_search", matched_at: new Date().toISOString() });
    setAdded((a) => ({ ...a, [m.candidate_id]: !error ? "added" : error.code === "23505" ? "exists" : "error" }));
  }

  const lineThree = (m: Match) => {
    const bad = m.checks.find((c) => c.status === "not_met");
    if (bad) return { text: `Doesn't meet: ${bad.label}`, cls: "text-rose-700 dark:text-rose-400" };
    const unk = m.checks.filter((c) => c.status === "unknown" || c.status === "near");
    if (unk.length) return { text: `Check on a call: ${unk.slice(0, 2).map((c) => c.label).join(", ")}`, cls: "text-amber-700 dark:text-amber-400" };
    return { text: m.reason || "Fits what you asked", cls: "text-emerald-700 dark:text-emerald-400" };
  };

  function pane(m: Match) {
    const st = added[m.candidate_id];
    const bad = m.checks.filter((c) => c.status === "not_met");
    const toAsk = m.checks.filter((c) => c.status === "unknown" || c.status === "near");
    const next: { tone: "go" | "warn" | "stop" | "info"; title: string; detail?: string } =
      st === "added" || st === "exists"
        ? { tone: "go", title: st === "added" ? "Added to this pipeline" : "Already in this pipeline", detail: "Call them from the Pipeline tab." }
        : bad.length > 0
          ? { tone: "warn", title: "Does not meet something you asked for", detail: bad.map((c) => c.label).join(" · ") }
          : toAsk.length > 0
            ? { tone: "info", title: "A good fit on paper. Call to confirm", detail: toAsk.slice(0, 4).map((c) => c.label).join(" · ") }
            : { tone: "go", title: "Fits what you asked on the facts we have", detail: "Add to the pipeline and call." };
    return (
      <div className="flex min-h-0 flex-col">
        <div className="sticky top-0 z-10 bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-start gap-4 border-b border-slate-100 p-5 dark:border-slate-800">
            <button type="button" onClick={() => setMobileOpen(false)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[13px] lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> List</button>
            <ScoreRing score={m.score} size={52} />
            <div className="min-w-[180px] flex-1">
              <a href={`/candidates/${m.candidate_id}`} target="_blank" rel="noopener noreferrer" className="text-[20px] font-semibold leading-tight tracking-tight text-slate-900 hover:underline dark:text-slate-100">{m.full_name}</a>
              <p className="truncate text-[13px] text-slate-500">{[m.current_job_title, m.current_employer].filter(Boolean).join(" at ") || "Role not on file"}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {st === "added" || st === "exists" ? (
                <span className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 text-[13px] font-semibold text-emerald-700">{st === "added" ? "Added" : "In the pipeline"}</span>
              ) : (
                <button type="button" disabled={st === "adding"} onClick={() => void add(m)} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-teal-600 px-3 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> {st === "adding" ? "Adding…" : `Add to ${roleTitle}`}</button>
              )}
              <button type="button" onClick={() => setTab("call")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-200"><PhoneCall className="h-3.5 w-3.5" /> Call now</button>
              {st === "error" && <span className="text-[13px] text-rose-600">Couldn&apos;t add. Try again.</span>}
            </div>
          </div>
          <div role="tablist" className="flex gap-0.5 border-b border-slate-100 px-4 dark:border-slate-800">
            {([["overview", "Overview"], ["call", "Call & details"]] as const).map(([k, label]) => (
              <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[14px] ${tab === k ? "border-teal-600 font-semibold text-slate-900 dark:text-slate-100" : "border-transparent text-slate-500 hover:text-slate-700"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 p-5">
          <NextStep tone={next.tone} title={next.title} detail={next.detail} />
          {tab === "overview" ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <FactTile label="Experience" value={m.total_experience_years !== null ? `${m.total_experience_years} yrs` : null} />
                <FactTile label="Location" value={m.current_location} />
                <FactTile label="Notice" value={m.notice_period} />
                <FactTile label="Current" value={lakh(m.current_fixed_ctc)} />
                <FactTile label="Expected" value={lakh(m.expected_fixed_ctc)} />
                <FactTile label="Practice" value={m.sub_domain} />
              </dl>
              <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wide text-slate-500">Why they came up</p>
                {m.reason && <p className="text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">{m.reason}</p>}
                {m.checks.length > 0 && (
                  <div className="mt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {m.checks.map((c) => (<span key={c.key} title={c.evidence} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${STATUS[c.status].cls}`}>{STATUS[c.status].icon}{c.label}</span>))}
                    </div>
                    <button type="button" onClick={() => setShowEvidence((v) => !v)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">{showEvidence ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} {showEvidence ? "Hide the evidence" : "Show the evidence"}</button>
                    {showEvidence && (
                      <ul className="mt-1 space-y-1 text-[13px] text-slate-600 dark:text-slate-300">
                        {m.checks.map((c) => (<li key={c.key}><span className="font-medium">{c.label}:</span> {STATUS[c.status].word}. {c.evidence}</li>))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
              <SkillsStrip candidateId={m.candidate_id} roleText={roleTitle} />
              <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60"><CvButtons candidateId={m.candidate_id} name={m.full_name} /></div>
              <AskMissingDetails candidateId={m.candidate_id} missing={m.missing.filter((l) => l !== "CV")} />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[14px] dark:bg-slate-800/60">
                <span className="text-slate-600 dark:text-slate-300">Fill this in when you speak to them. What they say is remembered and used for every future search and match.</span>
                <a href={`/candidates/${m.candidate_id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 font-medium"><Phone className="h-3.5 w-3.5" /> Phone is on the profile</a>
              </div>
              <CandidateCallPanel key={m.candidate_id} candidateId={m.candidate_id} roleCluster={roleCluster} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[minmax(350px,430px)_minmax(0,1fr)]">
      <div className={`${mobileOpen ? "hidden lg:block" : ""} overflow-hidden rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
        <div className="sticky top-0 z-[2] border-b border-slate-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, city" aria-label="Search this list" className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-[14px] outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800" />
        </div>
        {groups.map((g) => {
          const isClosed = closed.has(g.key);
          const rows = g.items.filter(matches);
          if (rows.length === 0) return null;
          return (
            <section key={g.key}>
              <button type="button" aria-expanded={!isClosed} onClick={() => setClosed((p) => { const n = new Set(p); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} title={g.blurb} className="sticky top-[49px] z-[1] flex w-full items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-left text-[12px] font-medium uppercase tracking-wide text-slate-600 dark:border-slate-800 dark:bg-slate-900">
                <span className="inline-flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${g.key === "right" ? "bg-emerald-500" : g.key === "close" ? "bg-amber-500" : "bg-slate-300"}`} />{g.title}</span>
                <span className="inline-flex items-center gap-1 tabular-nums">{rows.length} {isClosed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}</span>
              </button>
              {!isClosed && (
                <ul>
                  {rows.map((m) => {
                    const isActive = active?.candidate_id === m.candidate_id;
                    const l3 = lineThree(m);
                    const facts = [m.total_experience_years !== null ? `${m.total_experience_years} yrs` : null, m.current_fixed_ctc != null || m.expected_fixed_ctc != null ? `${m.current_fixed_ctc ?? "—"} → ${m.expected_fixed_ctc ?? "—"} LPA` : null, m.notice_period, m.current_location].filter(Boolean);
                    return (
                      <li key={m.candidate_id} className={`border-b border-slate-100 last:border-b-0 dark:border-slate-800 ${isActive ? "bg-teal-50 shadow-[inset_4px_0_0_0] shadow-teal-600 dark:bg-teal-950/40" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
                        <button type="button" aria-current={isActive} onClick={() => { setActiveId(m.candidate_id); setTab("overview"); setMobileOpen(true); }} className="grid w-full grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left">
                          <ScoreRing score={m.score} />
                          <span className="min-w-0">
                            <span className="flex items-baseline gap-1.5"><span className="max-w-[68%] shrink-0 truncate text-[15px] font-semibold text-slate-900 dark:text-slate-100">{m.full_name}</span><span className="min-w-0 flex-1 truncate text-[13px] text-slate-500">{[m.current_job_title, m.current_employer].filter(Boolean).join(" · ")}</span></span>
                            <span className="mt-0.5 block truncate text-[13px] tabular-nums text-slate-500">{facts.join(" · ") || "No facts yet"}</span>
                            <span className={`mt-0.5 block truncate text-[13px] ${l3.cls}`} title={l3.text}>{l3.text}</span>
                          </span>
                          {(added[m.candidate_id] === "added" || added[m.candidate_id] === "exists") && <Check className="h-4 w-4 text-emerald-600" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      <div className={`${mobileOpen ? "" : "hidden lg:block"} rounded-ros-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-3 lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto`}>
        {active ? pane(active) : <p className="p-10 text-center text-sm text-slate-400">Pick someone from the list.</p>}
      </div>
    </div>
  );
}
