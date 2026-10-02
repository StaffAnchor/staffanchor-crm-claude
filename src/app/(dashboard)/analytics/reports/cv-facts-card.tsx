"use client";

import { useEffect, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";

type Coverage = { withCv: number; read: number };
type StabilityResult = { checked: number; changed: number; filled: number };
type RunResult = { attempted: number; read: number; failed: number; errors: string[] };

// Admin control for the CV reader: shows how many CVs have been read and
// reads the next batch of the newest unread ones on demand.
export default function CvFactsCard() {
  const [coverage, setCoverage] = useState<Coverage | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loopRunning, setLoopRunning] = useState(false);
  const [loopNote, setLoopNote] = useState<string | null>(null);
  const [stabilityBusy, setStabilityBusy] = useState(false);
  const [stability, setStability] = useState<StabilityResult | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/cv-facts-backfill");
      if (res.ok) setCoverage(await res.json());
    } catch {
      // coverage is supplementary
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/cv-facts-backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }) });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? "Reading failed");
      else setResult(data);
      await load();
    } catch {
      setError("Request failed");
    } finally {
      setRunning(false);
    }
  }

  // Keeps reading batches until every CV is read (or something fails twice
  // in a row). The page has to stay open while it runs.
  async function runAll() {
    setLoopRunning(true);
    setError(null);
    setResult(null);
    let totalRead = 0;
    let failuresInARow = 0;
    try {
      for (let i = 0; i < 80; i++) {
        const res = await fetch("/api/admin/cv-facts-backfill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 20 }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          setError(data.error ?? "Reading stopped");
          break;
        }
        totalRead += data.read ?? 0;
        failuresInARow = data.read === 0 && data.attempted > 0 ? failuresInARow + 1 : 0;
        setLoopNote(`Read ${totalRead} so far...`);
        await load();
        if (data.attempted === 0 || failuresInARow >= 2) {
          setLoopNote(data.attempted === 0 ? `Done. Read ${totalRead} CVs.` : `Stopped after ${totalRead}: the remaining CVs couldn't be read.`);
          break;
        }
      }
    } catch {
      setError("Request failed");
    } finally {
      setLoopRunning(false);
    }
  }

  async function recomputeStability() {
    setStabilityBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/stability-recompute", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) setError(data.error ?? "Recompute failed");
      else setStability(data);
    } catch {
      setError("Request failed");
    } finally {
      setStabilityBusy(false);
    }
  }

  return (
    <div className="mt-6 rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <FileSearch className="w-4 h-4 text-teal-600" aria-hidden /> CV reading
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
            Reads each CV into structured facts (what they sold, to whom, team size, tools, flags). New CVs are read automatically; this reads the newest unread ones now.
          </p>
          {coverage && (
            <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-2">
              {coverage.read} of {coverage.withCv} CVs read
            </p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-stretch gap-2">
          <button
            onClick={run}
            disabled={running || loopRunning}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium px-3 py-2 hover:bg-slate-800 disabled:opacity-60"
          >
            {running && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {running ? "Reading..." : "Read the newest 20"}
          </button>
          <button
            onClick={runAll}
            disabled={running || loopRunning}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[13px] font-medium px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {loopRunning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {loopRunning ? "Reading all..." : "Read all remaining"}
          </button>
          <button
            onClick={recomputeStability}
            disabled={stabilityBusy}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[13px] font-medium px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {stabilityBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Recompute stability scores
          </button>
        </div>
      </div>
      {loopNote && <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-3">{loopNote} Keep this page open while it runs.</p>}
      {stability && (
        <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-3">
          Checked {stability.checked} timelines: {stability.changed} scores changed{stability.filled ? `, ${stability.filled} newly filled` : ""}.
        </p>
      )}
      {result && (
        <p className="text-[13px] text-slate-700 dark:text-slate-300 mt-3">
          Read {result.read} of {result.attempted}
          {result.failed > 0 ? `, ${result.failed} failed${result.errors[0] ? ` (${result.errors[0]})` : ""}` : ""}.
        </p>
      )}
      {error && <p className="text-[13px] text-red-600 mt-3">{error}</p>}
    </div>
  );
}
