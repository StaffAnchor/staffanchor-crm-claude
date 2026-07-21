"use client";

import { useState } from "react";
import { X, Sparkles, BadgeCheck, Loader2, AlertTriangle } from "lucide-react";
import { formatExperience } from "@/lib/format-experience";

type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  stability_line?: string;
  resume_highlights?: string[];
  profile_incomplete?: boolean;
};

export default function ProfilePassportTrigger({
  candidateId,
  token,
  fullName,
  currentJobTitle,
  currentEmployer,
  currentLocation,
  totalExperienceYears,
  subDomain,
  expectedFixedCtc,
  verifiedRelocation,
  verifiedNotice,
  industries,
  aiSummary: initialAiSummary,
  aiPassport: initialAiPassport,
}: {
  candidateId: string;
  token: string;
  fullName: string;
  currentJobTitle: string | null;
  currentEmployer: string | null;
  currentLocation: string | null;
  totalExperienceYears: number | null;
  subDomain: string | null;
  expectedFixedCtc: number | null;
  verifiedRelocation: string | null;
  verifiedNotice: string | null;
  industries: string[] | null;
  aiSummary: string | null;
  aiPassport: AiPassport | null;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState(initialAiSummary);
  const [aiPassport, setAiPassport] = useState(initialAiPassport);

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch("/api/public-ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not generate a summary right now.");
      setAiSummary(json.summary);
      setAiPassport(json.passport);
      setOpen(true);
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : "Could not generate a summary right now.");
    } finally {
      setGenerating(false);
    }
  }

  if (!aiSummary && !aiPassport) {
    return (
      <div className="mt-1">
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {generating ? "Generating…" : "Generate AI passport"}
        </button>
        {generateError && <p className="text-xs text-rose-600 mt-1">{generateError}</p>}
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        <Sparkles className="w-3 h-3" /> View profile passport
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-8"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Profile passport</p>
                <h2 className="text-lg font-semibold text-slate-900">{fullName}</h2>
                <p className="text-sm text-slate-500">
                  {currentJobTitle}
                  {currentEmployer ? ` at ${currentEmployer}` : ""}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {currentLocation} · {formatExperience(totalExperienceYears)} experience
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {aiPassport?.profile_incomplete && (
                <p className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  This candidate hasn&apos;t finished completing their profile yet, so this passport is based on
                  limited information.
                </p>
              )}
              {aiPassport?.headline && <p className="text-sm text-slate-800">{aiPassport.headline}</p>}
              {!aiPassport?.headline && aiSummary && <p className="text-sm text-slate-800">{aiSummary}</p>}

              {aiPassport?.compensation_line && (
                <p className="text-sm text-slate-600">{aiPassport.compensation_line}</p>
              )}
              {aiPassport?.targets_line && (
                <p className="text-sm text-slate-600">{aiPassport.targets_line}</p>
              )}
              {aiPassport?.stability_line && (
                <p className="text-sm text-slate-600">{aiPassport.stability_line}</p>
              )}

              {aiPassport?.resume_highlights && aiPassport.resume_highlights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                    Resume highlights
                  </p>
                  <ul className="space-y-1.5">
                    {aiPassport.resume_highlights.map((h, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-sm text-slate-700">
                        <BadgeCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Primary Specialization</p>
                  <p className="text-slate-700">{subDomain ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Expected fixed CTC</p>
                  <p className="text-slate-700">{expectedFixedCtc ? `₹${expectedFixedCtc}L` : "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Relocation — verified</p>
                  <p className="text-slate-700">{verifiedRelocation ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Notice period — verified</p>
                  <p className="text-slate-700">{verifiedNotice ?? "—"}</p>
                </div>
              </div>

              {industries && industries.length > 0 && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">Industries</p>
                  <div className="flex flex-wrap gap-1.5">
                    {industries.map((i) => (
                      <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {i}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
