"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, GraduationCap, Loader2, MapPin } from "lucide-react";
import { SkillsStrip } from "@/components/candidate-facts-strip";
import { useCardFacts } from "@/lib/use-card-facts";
import LazyCvPreview from "@/app/(dashboard)/mandates/[id]/lazy-cv-preview";

// One candidate card for every list in a mandate (Pipeline, Matches, Smart): who they are on the left, last jobs and degrees
// in the middle, the actions on the right, the key skills across the bottom and room underneath for what the list says about
// the fit. Each list brings its own actions and reasons; the shape stays the same so the pages read alike.

export type CardFact = { label: string; value: string | null };

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

export function CvButtons({ candidateId, name }: { candidateId: string; name: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/cv-url`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error ?? "No CV on file.");
      const a = document.createElement("a");
      a.href = j.url;
      a.download = j.fileName ?? `${name ?? "candidate"}-cv`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <LazyCvPreview candidateId={candidateId} name={name} variant="card" />
        <button type="button" onClick={download} disabled={busy} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-teal-600 text-[13px] font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60 dark:text-teal-300 dark:hover:bg-teal-950/30">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
        </button>
      </div>
      {error && <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-400">{error}</p>}
    </div>
  );
}

export default function CandidateCardLayout({
  candidateId,
  name,
  headline,
  tone = "none",
  dim = false,
  selected,
  onSelect,
  badges,
  facts,
  leftExtra,
  actions,
  roleText,
  as: Tag = "li",
  children,
}: {
  candidateId: string;
  name: string;
  headline: string;
  tone?: "good" | "mid" | "bad" | "none";
  dim?: boolean;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
  badges?: React.ReactNode;
  facts: CardFact[];
  leftExtra?: React.ReactNode;
  actions: React.ReactNode;
  roleText?: string | null;
  /** li inside a list (default), or div when the card sits outside one. */
  as?: "li" | "div";
  children?: React.ReactNode;
}) {
  const { facts: cv } = useCardFacts(candidateId, roleText);
  const edge = tone === "good" ? "border-l-emerald-500" : tone === "mid" ? "border-l-amber-400" : tone === "bad" ? "border-l-rose-400" : "border-l-slate-200";
  return (
    <Tag className={`rounded-ros-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${edge} ${dim ? "opacity-75" : ""}`}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            {onSelect && <input type="checkbox" checked={!!selected} onChange={(e) => onSelect(e.target.checked)} aria-label={`Select ${name}`} className="mt-1.5 h-4 w-4 shrink-0" />}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[13px] font-semibold text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">{initials(name)}</span>
            <div className="min-w-0">
              <Link href={`/candidates/${candidateId}`} target="_blank" rel="noopener noreferrer" className="block truncate text-[15px] font-semibold text-teal-700 hover:underline dark:text-teal-300">{name}</Link>
              <p className="truncate text-[12.5px] text-slate-500">{headline}</p>
            </div>
          </div>
          {badges && <div className="mt-2 flex flex-wrap items-center gap-1.5">{badges}</div>}
          <dl className="mt-2 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-300">
            {facts.map((f) => (
              <p key={f.label} className="flex items-center gap-1">
                {f.label === "Location" && <MapPin className="h-3 w-3 text-slate-400" />}
                <dt className="inline font-semibold">{f.label}: </dt>
                <dd className={`inline ${f.value ? "" : "text-slate-400"}`}>{f.value || "Not given"}</dd>
              </p>
            ))}
          </dl>
          {leftExtra && <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">{leftExtra}</div>}
        </div>

        <div className="min-w-0 space-y-2 text-[13px]">
          {!cv ? (
            <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}</div>
          ) : cv.roles.length === 0 ? (
            <p className="text-slate-400">Job history not read yet.</p>
          ) : (
            cv.roles.map((r, i) => (
              <div key={i}>
                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{r.company || "Company not given"}</p>
                <p className="truncate text-slate-500">{r.title}</p>
                <p className="text-slate-400">{r.period}</p>
              </div>
            ))
          )}
          <Link href={`/candidates/${candidateId}`} target="_blank" rel="noopener noreferrer" className="text-[12.5px] text-sky-700 hover:underline">Full profile and timeline</Link>
        </div>

        <div className="min-w-0 space-y-2 text-[13px]">
          {!cv ? (
            <div className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : cv.education.length === 0 ? (
            <p className="text-slate-400">Education not read yet.</p>
          ) : (
            cv.education.map((e, i) => (
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
        </div>

        <div className="flex min-w-[210px] flex-col gap-2 md:items-stretch">{actions}</div>
      </div>

      <SkillsStrip candidateId={candidateId} roleText={roleText} className="mt-3" />
      {children}
    </Tag>
  );
}
