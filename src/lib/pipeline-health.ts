import type { SupabaseClient } from "@supabase/supabase-js";

// Computes a point-in-time picture of whether the system is actually doing
// what it's supposed to be doing -- both "is the candidate-profile memory
// pipeline keeping up" (ai_summary / embedding / skill_inventory coverage)
// and "are the scheduled jobs that build that memory still firing"
// (cron_heartbeats). This is the automated version of the manual SQL audit
// that first caught the embedding pipeline sitting at 0/896 for weeks with
// no visible signal anywhere in the product.
export type HealthAlert = {
  severity: "critical" | "warning";
  area: string;
  message: string;
};

export type HealthMetrics = {
  totalCandidates: number;
  withAiSummary: number;
  withEmbedding: number;
  withSkillInventory: number;
  verifiedFactsCount: number;
  aiSummaryCoveragePct: number;
  embeddingCoveragePct: number;
  skillInventoryCoveragePct: number;
  crons: {
    jobName: string;
    lastRunAt: string | null;
    lastStatus: string | null;
    expectedIntervalMinutes: number | null;
    minutesSinceLastRun: number | null;
    overdue: boolean;
  }[];
};

const ALL_CRON_JOBS: { jobName: string; expectedIntervalMinutes: number }[] = [
  { jobName: "auto-summarize", expectedIntervalMinutes: 4320 },
  { jobName: "client-followup", expectedIntervalMinutes: 1440 },
  { jobName: "embed-candidates", expectedIntervalMinutes: 1440 },
  { jobName: "inbox-sweep", expectedIntervalMinutes: 1440 },
  { jobName: "mandate-auto-rematch", expectedIntervalMinutes: 4320 },
  { jobName: "career-timeline-sweep", expectedIntervalMinutes: 4320 },
  { jobName: "joining-followup", expectedIntervalMinutes: 1440 },
  { jobName: "client-portal-inactivity", expectedIntervalMinutes: 10080 },
  { jobName: "sales-briefing-sweep", expectedIntervalMinutes: 1440 },
  { jobName: "profile-nudge-sweep", expectedIntervalMinutes: 1440 },
  { jobName: "proactive-match-sweep", expectedIntervalMinutes: 10080 },
  { jobName: "outcome-reweight-sweep", expectedIntervalMinutes: 1440 },
];

// A job is "overdue" once it's gone 2x its own expected interval without a
// heartbeat, plus a 60-minute grace window so normal Vercel cron jitter
// doesn't false-positive.
function isOverdue(lastRunAt: string | null, expectedIntervalMinutes: number): boolean {
  if (!lastRunAt) return true;
  const minutesSince = (Date.now() - new Date(lastRunAt).getTime()) / 60000;
  return minutesSince > expectedIntervalMinutes * 2 + 60;
}

export async function computeHealthSnapshot(
  supabase: SupabaseClient
): Promise<{ metrics: HealthMetrics; alerts: HealthAlert[] }> {
  const [{ count: total }, { count: withSummary }, { count: withEmbedding }, { count: withSkillInventory }, { count: verifiedFacts }, { data: heartbeats }] =
    await Promise.all([
      supabase.from("candidates").select("id", { count: "exact", head: true }),
      supabase.from("candidates").select("id", { count: "exact", head: true }).not("ai_summary", "is", null),
      supabase.from("candidates").select("id", { count: "exact", head: true }).not("profile_embedding", "is", null),
      supabase.from("candidates").select("id", { count: "exact", head: true }).not("skill_inventory", "is", null),
      supabase.from("candidate_verified_facts").select("id", { count: "exact", head: true }),
      supabase.from("cron_heartbeats").select("job_name, last_run_at, last_status, expected_interval_minutes"),
    ]);

  const totalCandidates = total ?? 0;
  const withAiSummary = withSummary ?? 0;
  const withEmb = withEmbedding ?? 0;
  const withSkills = withSkillInventory ?? 0;
  const pct = (n: number) => (totalCandidates > 0 ? Math.round((n / totalCandidates) * 1000) / 10 : 0);

  const heartbeatByJob = new Map((heartbeats ?? []).map((h) => [h.job_name, h]));
  const crons = ALL_CRON_JOBS.map(({ jobName, expectedIntervalMinutes }) => {
    const hb = heartbeatByJob.get(jobName);
    const lastRunAt = hb?.last_run_at ?? null;
    const minutesSinceLastRun = lastRunAt ? Math.round((Date.now() - new Date(lastRunAt).getTime()) / 60000) : null;
    return {
      jobName,
      lastRunAt,
      lastStatus: hb?.last_status ?? null,
      expectedIntervalMinutes,
      minutesSinceLastRun,
      overdue: isOverdue(lastRunAt, expectedIntervalMinutes),
    };
  });

  const alerts: HealthAlert[] = [];

  for (const c of crons) {
    if (c.overdue) {
      alerts.push({
        severity: "critical",
        area: `cron:${c.jobName}`,
        message: c.lastRunAt
          ? `"${c.jobName}" hasn't run in ${c.minutesSinceLastRun} minutes (expected every ~${c.expectedIntervalMinutes}min). It may be failing silently or the schedule stopped firing.`
          : `"${c.jobName}" has never recorded a successful run since heartbeat tracking was added -- verify it's actually wired into vercel.json and firing.`,
      });
    } else if (c.lastStatus === "error") {
      alerts.push({
        severity: "warning",
        area: `cron:${c.jobName}`,
        message: `"${c.jobName}"'s most recent run ended in an error.`,
      });
    }
  }

  if (totalCandidates > 20 && withEmb === 0) {
    alerts.push({
      severity: "critical",
      area: "embeddings",
      message: `0 of ${totalCandidates} candidates have a match-ready embedding -- semantic matching and the Cmd+K copilot are effectively blind. Run the embedding backfill.`,
    });
  } else if (totalCandidates > 0 && pct(withEmb) < 50) {
    alerts.push({
      severity: "warning",
      area: "embeddings",
      message: `Only ${pct(withEmb)}% of candidates have an embedding -- matching quality is degraded for the rest.`,
    });
  }

  if (totalCandidates > 20 && pct(withAiSummary) < 15) {
    alerts.push({
      severity: "warning",
      area: "ai_summary",
      message: `Only ${pct(withAiSummary)}% of candidates have an AI summary.`,
    });
  }

  return {
    metrics: {
      totalCandidates,
      withAiSummary,
      withEmbedding: withEmb,
      withSkillInventory: withSkills,
      verifiedFactsCount: verifiedFacts ?? 0,
      aiSummaryCoveragePct: pct(withAiSummary),
      embeddingCoveragePct: pct(withEmb),
      skillInventoryCoveragePct: pct(withSkills),
      crons,
    },
    alerts,
  };
}
