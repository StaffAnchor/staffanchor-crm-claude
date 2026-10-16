"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, FileText, Loader2, RefreshCw } from "lucide-react";
import { briefToText, type Brief } from "@/lib/candidate-brief";

// The candidate brief: the client-ready presentation, written and refreshed by the system. Copy it for an
// email or WhatsApp; the client version leaves out the name and employer.
export default function BriefCard({
  candidateId,
  brief,
  generatedAt,
  fromCall,
  name,
  employer,
}: {
  candidateId: string;
  brief: Brief | null;
  generatedAt: string | null;
  fromCall: boolean;
  name: string | null;
  employer: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"client" | "full" | null>(null);

  async function regenerate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/brief`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!d.ok) setError(d.error ?? "Couldn't write the brief.");
      else router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(blind: boolean) {
    if (!brief) return;
    try {
      await navigator.clipboard.writeText(briefToText(brief, { name, employer }, blind));
      setCopied(blind ? "client" : "full");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Copy was blocked by the browser.");
    }
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <FileText className="h-4 w-4 text-blue-600" />
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Candidate brief</h3>
        <span className="text-[12px] text-slate-400">
          Written by the system{fromCall ? " from the CV and your call notes" : " from the CV"}
          {generatedAt ? ` · ${new Date(generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {brief && (
            <>
              <button type="button" onClick={() => copy(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800" title="Without the name or employer, for a first look by a client">
                {copied === "client" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Copy client version
              </button>
              <button type="button" onClick={() => copy(false)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-[12px] font-medium hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800">
                {copied === "full" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} Copy with name
              </button>
            </>
          )}
          <button type="button" onClick={regenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {brief ? "Rewrite" : "Write the brief"}
          </button>
        </div>
      </div>
      {error && <p className="mb-2 text-[12.5px] text-rose-600">{error}</p>}

      {!brief ? (
        <p className="text-[12.5px] text-slate-500">No brief yet. It is written automatically after your first call note or when someone is added to the Talent Pool. Or write it now.</p>
      ) : (
        <div className="space-y-3 text-[13px] text-slate-700 dark:text-slate-200">
          <div>
            <p className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{brief.headline}</p>
            <p className="mt-1 leading-6">{brief.summary}</p>
          </div>
          {brief.signals.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {brief.signals.map((s) => (
                <span key={s} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11.5px] font-medium text-blue-800 ring-1 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800">
                  {s}
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {brief.selling.length > 0 && (
              <div>
                <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Selling track record</p>
                <ul className="list-disc space-y-0.5 pl-5">{brief.selling.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
            {brief.strengths.length > 0 && (
              <div>
                <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Strengths</p>
                <ul className="list-disc space-y-0.5 pl-5">{brief.strengths.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            )}
          </div>
          {brief.recruiter_take && (
            <p className="rounded-ros-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
              <span className="font-semibold">Our take:</span> {brief.recruiter_take}
            </p>
          )}
          {brief.probe.length > 0 && (
            <div>
              <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">Worth testing</p>
              <ul className="list-disc space-y-0.5 pl-5">{brief.probe.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          <p className="text-[12px] text-slate-500">
            {[brief.logistics.city && `Based in ${brief.logistics.city}`, brief.logistics.notice && `Notice ${brief.logistics.notice}`, brief.logistics.pay, brief.logistics.relocation && `Relocation: ${brief.logistics.relocation}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
