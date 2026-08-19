"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";

// Automated answer to "is anything actually broken right now" -- reads the
// same coverage numbers as AiHealthCard plus every cron's last-heartbeat
// freshness (cron_heartbeats, written by src/lib/cron-heartbeat.ts on every
// scheduled job run) and flags anything that's gone quiet or is failing.
// The daily pipeline-health-check cron persists a snapshot + emails an
// alert when something's critical; this card is the always-current live
// view for whenever an admin opens Reports.
type HealthAlert = { severity: "critical" | "warning"; area: string; message: string };
type CronStatus = {
  jobName: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  expectedIntervalMinutes: number | null;
  minutesSinceLastRun: number | null;
  overdue: boolean;
};
type Metrics = {
  totalCandidates: number;
  aiSummaryCoveragePct: number;
  embeddingCoveragePct: number;
  skillInventoryCoveragePct: number;
  verifiedFactsCount: number;
  crons: CronStatus[];
};

function formatMinutesAgo(mins: number | null): string {
  if (mins === null) return "never";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default function SystemHealthCard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [alerts, setAlerts] = useState<HealthAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/pipeline-health");
        const data = await res.json();
        if (res.ok) {
          setMetrics(data.metrics);
          setAlerts(data.alerts ?? []);
        } else {
          setError(data.error ?? "Couldn't load system health");
        }
      } catch {
        setError("Request failed");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return null;
  if (error) return null;
  if (!metrics) return null;

  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const isHealthy = alerts.length === 0;

  return (
    <Card className="p-4 mb-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-start justify-between gap-4 flex-wrap text-left"
      >
        <div className="flex items-start gap-2.5">
          {isHealthy ? (
            <ShieldCheck className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
          ) : (
            <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${criticalCount > 0 ? "text-red-600" : "text-amber-600"}`} />
          )}
          <div>
            <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
              System health {isHealthy ? "— all clear" : `— ${alerts.length} issue${alerts.length > 1 ? "s" : ""} flagged`}
            </p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
              {metrics.embeddingCoveragePct}% embedded · {metrics.aiSummaryCoveragePct}% summarized ·{" "}
              {metrics.skillInventoryCoveragePct}% skill-mapped · {metrics.verifiedFactsCount} verified facts recorded ·{" "}
              {metrics.crons.filter((c) => c.overdue).length} of {metrics.crons.length} scheduled jobs overdue
            </p>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {alerts.length > 0 && (
            <div className="space-y-1.5">
              {alerts.map((a, i) => (
                <p
                  key={i}
                  className={`text-[12px] ${a.severity === "critical" ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}
                >
                  <span className="font-medium">{a.area}</span>: {a.message}
                </p>
              ))}
            </div>
          )}
          <div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">Scheduled jobs</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
              {metrics.crons.map((c) => (
                <div key={c.jobName} className="flex items-center justify-between text-[12px] py-0.5">
                  <span className="text-slate-600 dark:text-slate-300">{c.jobName}</span>
                  <span
                    className={
                      c.overdue
                        ? "text-red-600 dark:text-red-400"
                        : c.lastStatus === "error"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-400"
                    }
                  >
                    {formatMinutesAgo(c.minutesSinceLastRun)}
                    {c.lastStatus === "error" && !c.overdue ? " (last run errored)" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
