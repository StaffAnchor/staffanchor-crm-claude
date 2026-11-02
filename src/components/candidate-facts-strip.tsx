"use client";

import { Check, GraduationCap } from "lucide-react";
import { useCardFacts } from "@/lib/use-card-facts";

// The strip of key skills under a candidate card, for example "B2B Sales · SaaS · Hunter · Salesforce". Skills that match the
// role are green with a tick and come first. With `full`, the last two jobs and the degrees sit beneath it, so the list can be
// read like a set of profiles without opening each one.
export function SkillsStrip({ candidateId, roleText, className = "" }: { candidateId: string; roleText?: string | null; className?: string }) {
  const { facts, loading } = useCardFacts(candidateId, roleText);
  if (loading) return <div className={`flex gap-1.5 ${className}`}>{[0, 1, 2].map((i) => <span key={i} className="h-5 w-16 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />)}</div>;
  if (!facts || facts.skills.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`} aria-label="Key skills">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Key skills</span>
      {facts.skills.map((s) => (
        <span key={s.text} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium ${s.match ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-200 dark:ring-emerald-800" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
          {s.match && <Check className="h-3 w-3" />}
          {s.text}
        </span>
      ))}
    </div>
  );
}

export default function CandidateFactsStrip({ candidateId, roleText, className = "" }: { candidateId: string; roleText?: string | null; className?: string }) {
  const { facts } = useCardFacts(candidateId, roleText);
  return (
    <div className={`space-y-2 ${className}`}>
      <SkillsStrip candidateId={candidateId} roleText={roleText} />
      {facts && (facts.roles.length > 0 || facts.education.length > 0) && (
        <div className="grid gap-x-6 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] sm:grid-cols-2 dark:bg-slate-800/40">
          <div className="min-w-0 space-y-1">
            {facts.roles.length === 0 ? (
              <p className="text-slate-400">Job history not read yet.</p>
            ) : (
              facts.roles.map((r, i) => (
                <p key={i} className="truncate text-slate-600 dark:text-slate-300">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{r.company || "Company not given"}</span> · {r.title}
                  {r.period && <span className="text-slate-400"> · {r.period}</span>}
                </p>
              ))
            )}
          </div>
          <div className="min-w-0 space-y-1">
            {facts.education.length === 0 ? (
              <p className="text-slate-400">Education not read yet.</p>
            ) : (
              facts.education.map((e, i) => (
                <p key={i} className="flex items-center gap-1.5 truncate text-slate-600 dark:text-slate-300">
                  <GraduationCap className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate"><span className="font-semibold text-slate-800 dark:text-slate-100">{e.institution || e.degree}</span>{e.institution && e.degree ? ` · ${e.degree}` : ""}{e.year ? ` · ${e.year}` : ""}</span>
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
