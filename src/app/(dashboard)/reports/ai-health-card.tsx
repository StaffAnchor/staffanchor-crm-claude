"use client";

import { useEffect, useState } from "react";
import { BrainCircuit, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";

// Admin-only visibility into whether the system is actually "reading" and
// memorizing every incoming candidate profile -- ai_summary and
// profile_embedding are what matchCandidatesForMandate's semantic recall
// and the Cmd+K Copilot depend on, and both have silently gone stale before
// (see /api/cron/embed-candidates, /api/admin/embed-backfill) with zero
// visible signal in the UI that anything was wrong. This card + its "Run
// backfill now" button close that gap: a number recruiters/admins can
// actually see, and a lever to pull without waiting on the daily cron.
type Stats = { total: number; missingEmbedding: number; missingSummary: number };
type RunResult = { processed: number; candidatesConsidered: number; errorSamples: string[] };

export default function AiHealthCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    loadStats();
  }, []);

  async function runBackfill() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/embed-backfill", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? data.note ?? "Backfill failed");
      } else if (data.note) {
        setError(data.note);
      } else {
        setResult(data);
      }
      await loadStats();
    } catch {
      setError("Request failed");
    } finally {
      setRunning(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          <BrainCircuit className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">AI system health</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              {stats ? (
                <>
                  {stats.total} candidates in system · {stats.missingEmbedding} missing a match-ready embedding ·{" "}
                  {stats.missingSummary} missing an AI summary
                </>
              ) : (
                "Couldn't load stats"
              )}
            </p>
            {result && (
              <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-1">
                Backfilled {result.processed} of {result.candidatesConsidered} pending candidates.
              </p>
            )}
            {result && result.errorSamples.length > 0 && (
              <p className="text-[12px] text-amber-700 dark:text-amber-400 mt-1">
                Some failed — sample reasons: {result.errorSamples.join(" · ")}
              </p>
            )}
            {error && <p className="text-[12px] text-red-600 dark:text-red-400 mt-1">{error}</p>}
          </div>
        </div>
        <button
          onClick={runBackfill}
          disabled={running}
          className="flex items-center gap-1.5 text-[12px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/30 hover:bg-indigo-100 rounded-ros-md px-3 py-1.5 transition-colors duration-200 ease-ros disabled:opacity-60 shrink-0"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {running ? "Running…" : "Run backfill now"}
        </button>
      </div>
    </Card>
  );
}
