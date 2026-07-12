"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, BadgeCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  stability_line?: string;
  resume_highlights?: string[];
  profile_incomplete?: boolean;
};

export default function AiSummaryPanel({
  candidateId,
  initialSummary,
  initialPassport,
}: {
  candidateId: string;
  initialSummary: string | null;
  initialPassport?: AiPassport | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState(initialSummary);
  const [passport, setPassport] = useState<AiPassport | null>(initialPassport ?? null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Something went wrong.");
      } else {
        setSummary(json.summary);
        setPassport(json.passport ?? null);
        router.refresh();
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900 dark:text-slate-100">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          AI summary <span className="text-[11px] font-normal text-slate-400">(shown to clients on the shortlist link/portal once generated)</span>
        </h3>
        <Button variant="secondary" size="sm" onClick={handleGenerate} disabled={loading} icon={loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}>
          {summary ? "Regenerate" : "Generate"}
        </Button>
      </div>
      {error && <p className="text-[12px] text-rose-600 mb-2">{error}</p>}
      {passport?.profile_incomplete && (
        <p className="flex items-center gap-1.5 text-[11.5px] text-amber-700 bg-amber-50 rounded-ros-md px-2.5 py-1.5 mb-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          Profile incomplete — this candidate hasn&apos;t finished registering yet, so the summary below is based on
          limited information. It will regenerate automatically once they complete their profile.
        </p>
      )}
      <p className="text-[13px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800/50 rounded-ros-md p-3">
        {summary || "Not generated yet — click Generate to summarize this candidate from their profile data."}
      </p>
      {passport?.resume_highlights && passport.resume_highlights.length > 0 && (
        <div className="mt-2 bg-slate-50 dark:bg-slate-800/50 rounded-ros-md p-3">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1.5">
            From their resume
          </p>
          <ul className="space-y-1">
            {passport.resume_highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[12.5px] text-slate-600 dark:text-slate-400">
                <BadgeCheck className="w-3.5 h-3.5 text-teal-500 mt-0.5 shrink-0" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
