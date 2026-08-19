"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw, ScanSearch } from "lucide-react";
import { Card } from "@/components/ui/card";

// Admin-only visibility into whether the system is actually "reading" and
// memorizing every incoming candidate profile -- ai_summary, stability_score
// (computed from the resume's career timeline), and profile_embedding are
// what matchCandidatesForMandate's semantic recall and the Cmd+K Copilot
// depend on, and all three have silently gone stale before with zero
// visible signal in the UI that anything was wrong. This card + its two
// backfill buttons close that gap: numbers recruiters/admins can actually
// see, and levers to pull without waiting on the daily crons.
//
// Two separate buttons because they're two separate pipelines with
// different quota profiles: embeddings are Gemini-only (no Groq/Mistral
// embedding model exists), while the profile backfill (summary +
// stability + embedding, all via generateAiPassportForCandidate) uses the
// full Gemini -> Groq -> Mistral fallback chain. Both process newest
// candidates first -- whoever just applied is who a recruiter is looking
// at right now, not someone who registered eight months ago.
type Stats = { total: number; missingEmbedding: number; missingSummary: number; missingStability: number };
type EmbedRunResult = { processed: number; candidatesConsidered: number; errorSamples: string[] };
type SummaryRunResult = { processed: number; errorSamples: string[] };

export default function AiHealthCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [runningEmbed, setRunningEmbed] = useState(false);
  const [embedResult, setEmbedResult] = useState<EmbedRunResult | null>(null);
  const [embedError, setEmbedError] = useState<string | null>(null);

  const [runningSummary, setRunningSummary] = useState(false);
  const [summaryResult, setSummaryResult] = useState<SummaryRunResult | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/embed-backfill");
        const data = await res.json();
        if (res.ok) setStats(data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/embed-backfill");
      const data = await res.json();
      if (res.ok) setStats(data);
    } finally {
      setLoading(false);
    }
  }

  async function runEmbedBackfill() {
    setRunningEmbed(true);
    setEmbedResult(null);
    setEmbedError(null);
    try {
      const res = await fetch("/api/admin/embed-backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setEmbedError(data.error ?? data.note ?? "Backfill failed");
      } else if (data.note) {
        setEmbedError(data.note);
      } else {
        setEmbedResult(data);
      }
      await loadStats();
    } catch {
      setEmbedError("Request failed");
    } finally {
      setRunningEmbed(false);
    }
  }

  async function runSummaryBackfill() {
    setRunningSummary(true);
    setSummaryResult(null);
    setSummaryError(null);
    try {
      const res = await fetch("/api/admin/summary-backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setSummaryError(data.error ?? data.note ?? "Backfill failed");
      } else if (data.note) {
        setSummaryError(data.note);
      } else {
        setSummaryResult(data);
      }
      await loadStats();
    } catch {
      setSummaryError("Request failed");
    } finally {
      setRunningSummary(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start gap-2.5 mb-3">
        <BrainCircuit className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">AI system health</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {stats ? (
              <>
                {stats.total} candidates in system · {stats.missingSummary} missing an AI summary ·{" "}
                {stats.missingStability} missing a stability score · {stats.missingEmbedding} missing a match-ready
                embedding
              </>
            ) : (
              "Couldn't load stats"
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="flex-1 flex items-center justify-between gap-2 rounded-ros-md bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
              Read CV → summary + stability score
            </p>
            {summaryResult && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                Backfilled {summaryResult.processed} candidates (newest first).
              </p>
            )}
            {summaryResult && summaryResult.errorSamples.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                Some failed: {summaryResult.errorSamples.join(" · ")}
              </p>
            )}
            {summaryError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{summaryError}</p>}
          </div>
          <button
            onClick={runSummaryBackfill}
            disabled={runningSummary}
            className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 rounded-ros-md px-3 py-1.5 transition-colors duration-200 ease-ros disabled:opacity-60 shrink-0"
          >
            {runningSummary ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            {runningSummary ? "Running…" : "Run now"}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-between gap-2 rounded-ros-md bg-slate-50 dark:bg-slate-800/40 px-3 py-2">
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">Embedding backfill</p>
            {embedResult && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                Backfilled {embedResult.processed} of {embedResult.candidatesConsidered} pending.
              </p>
            )}
            {embedResult && embedResult.errorSamples.length > 0 && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                Some failed: {embedResult.errorSamples.join(" · ")}
              </p>
            )}
            {embedError && <p className="text-[11px] text-red-600 dark:text-red-400 mt-0.5">{embedError}</p>}
          </div>
          <button
            onClick={runEmbedBackfill}
            disabled={runningEmbed}
            className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 rounded-ros-md px-3 py-1.5 transition-colors duration-200 ease-ros disabled:opacity-60 shrink-0"
          >
            {runningEmbed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {runningEmbed ? "Running…" : "Run now"}
          </button>
        </div>
      </div>
    </Card>
  );
}
