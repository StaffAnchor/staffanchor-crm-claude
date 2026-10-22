import { AUDIT_CHECKS, MEASURES, PROGRESS_WEIGHTS, change, resultOf } from "@/lib/lab/calc";
import type { CohortData, MemberMetrics } from "@/lib/lab/data";
import { Bar, ResultPill, signed, toneFor } from "./ui";

// One manager's progress, the same for the manager, their sales head, management and the facilitator.
export default function MemberProgress({ m, data, assignments }: { m: MemberMetrics; data: CohortData; assignments: Record<number, boolean> }) {
  const avg = (key: string, phase: "baselineAvg" | "endlineAvg") => data.rollup.per.find((p) => p.key === key)?.[phase] ?? null;
  const w = PROGRESS_WEIGHTS;
  const held = data.sessionsHeld;
  const parts = [
    { label: "Details added", have: m.member.profile_done_at ? 1 : 0, of: 1, weight: w.profile, text: m.member.profile_done_at ? "Done" : "Not yet" },
    { label: "Baseline entered", have: m.baselineEntered, of: MEASURES.length, weight: w.baseline, text: `${m.baselineEntered} of ${MEASURES.length}` },
    { label: "Sessions attended", have: m.attended, of: Math.max(held, 1), weight: w.attendance, text: held ? `${m.attended} of ${held}` : "None held yet" },
    { label: "Assignments done", have: m.assignmentsDone, of: Math.max(held, 1), weight: w.assignments, text: held ? `${m.assignmentsDone} of ${held}` : "None due yet" },
    { label: "Endline entered", have: m.endlineEntered, of: MEASURES.length, weight: w.endline, text: `${m.endlineEntered} of ${MEASURES.length}` },
  ];
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-end justify-between">
          <div><p className="text-xs font-medium uppercase tracking-wide text-slate-500">Programme progress</p><p className="text-3xl font-semibold text-slate-900 dark:text-slate-100">{m.progress}%</p></div>
          <p className="text-xs text-slate-500">Cohort average {data.kpis.avgProgress ?? "–"}%</p>
        </div>
        <div className="mt-3"><Bar pct={m.progress} tone={toneFor(m.progress)} /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {parts.map((p) => (
            <div key={p.label}>
              <p className="text-xs text-slate-500">{p.label}</p>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{p.text}</p>
              <div className="mt-1"><Bar pct={(p.have / p.of) * 100} tone="slate" /></div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">The four measures</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="py-2 pr-3 font-medium">Measure</th><th className="px-3 font-medium">Baseline</th><th className="px-3 font-medium">Endline</th><th className="px-3 font-medium">Change</th><th className="px-3 font-medium">Result</th><th className="px-3 font-medium">Cohort avg</th></tr></thead>
            <tbody>
              {MEASURES.map((x) => {
                const pair = m.values[x.key] ?? { baseline: null, endline: null };
                return (
                  <tr key={x.key} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-3 pr-3 font-medium text-slate-800 dark:text-slate-200">{x.label}</td>
                    <td className="px-3 tabular-nums">{pair.baseline ?? "–"}</td>
                    <td className="px-3 tabular-nums">{pair.endline ?? "–"}</td>
                    <td className="px-3 tabular-nums">{signed(change(pair))}</td>
                    <td className="px-3"><ResultPill r={resultOf(pair, x.betterWhen)} /></td>
                    <td className="px-3 tabular-nums text-slate-500">{avg(x.key, "baselineAvg") ?? "–"} → {avg(x.key, "endlineAvg") ?? "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {m.endlineEntered === MEASURES.length && <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">Improved on <b>{m.improved} of {MEASURES.length}</b> measures.</p>}
      </section>

      {m.audit.started > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pipeline audit</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.audit.completed} deal{m.audit.completed === 1 ? "" : "s"} audited{m.audit.started > m.audit.completed ? `, ${m.audit.started - m.audit.completed} half-filled` : ""}. Average score {m.audit.avgScore ?? "–"} of 9.</p>
          {m.audit.weakestIndex != null && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Habit to fix first: <b>{AUDIT_CHECKS[m.audit.weakestIndex]}</b> ({m.audit.noCounts[m.audit.weakestIndex]} of {m.audit.completed} deals).</p>}
        </section>
      )}

      {(m.cadence.weeks > 0 || m.reflections.total > 0 || m.charter.total > 0 || m.onboarding.total > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Habits and routines</h2>
          <ul className="mt-1.5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
            {m.cadence.weeks > 0 && <li>Follow-up cadence: {m.cadence.avgPct ?? "–"}% on time across {m.cadence.weeks} weekly checks (latest {m.cadence.latestPct ?? "–"}%).</li>}
            {m.reflections.total > 0 && <li>Weekly reflection: {m.reflections.total} note{m.reflections.total === 1 ? "" : "s"}, {m.reflections.lastFourWeeks} of the last 4 weeks.</li>}
            {m.charter.total > 0 && <li>90-day charter: {m.charter.total} priorit{m.charter.total === 1 ? "y" : "ies"}, {m.charter.withResult} with a result{m.charter.reviewOverdue ? `, ${m.charter.reviewOverdue} past review date` : ""}.</li>}
            {m.onboarding.total > 0 && <li>New-rep onboarding: {m.onboarding.total} plan{m.onboarding.total === 1 ? "" : "s"}, weekly checks logged {m.onboarding.loggedPct ?? "–"}% of those expected.</li>}
          </ul>
        </section>
      )}

      {m.plans.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance plans</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.plans.total} plan{m.plans.total === 1 ? "" : "s"}: {m.plans.open} open, {m.plans.met} standard met, {m.plans.notMet} not met{m.plans.overdueReviews ? `, ${m.plans.overdueReviews} review${m.plans.overdueReviews === 1 ? "" : "s"} overdue` : ""}. Plan content is private to the manager.</p>
        </section>
      )}

      {m.banding.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Rep banding</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.banding.total} rep{m.banding.total === 1 ? "" : "s"} banded by tenure. {m.banding.diagnose} to diagnose, {m.banding.stretch} in band, {m.banding.learn} to learn from.</p>
        </section>
      )}

      {m.oneOnOnes.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">One-on-ones</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.oneOnOnes.total} one-on-one{m.oneOnOnes.total === 1 ? "" : "s"} recorded across {m.oneOnOnes.reps} rep{m.oneOnOnes.reps === 1 ? "" : "s"}. {m.oneOnOnes.doneOnTimePct != null ? `${m.oneOnOnes.doneOnTimePct}% of checked commitments were done on time. ` : ""}{m.oneOnOnes.overdueOpen ? `${m.oneOnOnes.overdueOpen} overdue and unchecked.` : ""}</p>
        </section>
      )}

      {m.coaching.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Coaching</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.coaching.total} conversation{m.coaching.total === 1 ? "" : "s"} prepared across {m.coaching.reps} rep{m.coaching.reps === 1 ? "" : "s"}. Skill {m.coaching.gaps.skill}, will {m.coaching.gaps.will}, system {m.coaching.gaps.system}. {m.coaching.followUps > 0 ? `Follow-ups done ${m.coaching.followedUp} of ${m.coaching.followUps}${m.coaching.overdue ? `, ${m.coaching.overdue} overdue` : ""}.` : ""}</p>
        </section>
      )}

      {m.reviews.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Review meetings</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.reviews.total} review{m.reviews.total === 1 ? "" : "s"} prepared. {m.reviews.actionLoggedPct != null ? `${m.reviews.actionLoggedPct}% of actions logged in the company system. ` : ""}{m.reviews.followUps > 0 ? `Follow-ups done ${m.reviews.followedUp} of ${m.reviews.followUps}${m.reviews.overdue ? `, ${m.reviews.overdue} overdue` : ""}.` : ""}</p>
        </section>
      )}

      {m.forecast.months > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Forecast accuracy</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.forecast.months} month{m.forecast.months === 1 ? "" : "s"} tracked. Average accuracy {m.forecast.avgAccuracy}%. {m.forecast.withinBand} within the band, {m.forecast.over} over-called, {m.forecast.under} under-called.</p>
        </section>
      )}

      {m.calls.calls > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Call quality</h2>
          <p className="mt-0.5 text-xs text-slate-500">{m.calls.calls} call{m.calls.calls === 1 ? "" : "s"} scored across {m.calls.reps} rep{m.calls.reps === 1 ? "" : "s"}. Average score {m.calls.avgScore ?? "–"} of 100.</p>
          {m.calls.weakestKey && <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">Lowest-rated criterion: <b>{m.calls.perCriterion.find((c) => c.key === m.calls.weakestKey)?.label}</b> ({m.calls.perCriterion.find((c) => c.key === m.calls.weakestKey)?.avgRating} of 5).</p>}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Sessions</h2>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {data.sessions.map((s) => {
            const marked = data.attendance.some((a) => a.session_id === s.id);
            const present = data.attendance.find((a) => a.session_id === s.id && a.member_id === m.member.id)?.present;
            return (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span className="text-slate-800 dark:text-slate-200">{s.n}. {s.title}{s.held_on ? <span className="ml-2 text-xs text-slate-500">{new Date(s.held_on + "T00:00:00Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })}</span> : null}</span>
                <span className="flex items-center gap-2 text-xs">
                  <span className={marked ? (present ? "text-emerald-700" : "text-rose-700") : "text-slate-400"}>{marked ? (present ? "Attended" : "Absent") : "Not marked"}</span>
                  <span className={assignments[s.n] ? "text-emerald-700" : "text-slate-400"}>{assignments[s.n] ? "Assignment done" : "Assignment open"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
