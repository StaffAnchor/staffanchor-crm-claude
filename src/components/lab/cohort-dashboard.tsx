import Link from "next/link";
import { AUDIT_CHECKS, COST_FIELDS, MEASURES, ROOT_CAUSES } from "@/lib/lab/calc";
import type { CohortData } from "@/lib/lab/data";
import { Bar, Kpi, StatusChip, signed, toneFor } from "./ui";

// The cohort view for sales heads, management and the facilitator: how far the cohort has got, what moved, and who
// needs a nudge. Each manager links to their own progress page.
export default function CohortDashboard({ data, memberHref, onlyIds, exportBase }: { data: CohortData; memberHref: (id: string) => string; onlyIds?: Set<string>; exportBase?: string }) {
  const dl = (format: string) => `${exportBase}${exportBase?.includes("?") ? "&" : "?"}format=${format}`;
  const fs = data.finalStats;
  const rs = (n: number | null) => (n == null ? "–" : `Rs ${n.toLocaleString("en-IN")}`);
  const all = data.managers;
  const rows = (onlyIds ? all.filter((m) => onlyIds.has(m.member.id)) : all).slice().sort((a, b) => a.progress - b.progress);
  const k = data.kpis;
  const pctText = (v: number | null) => (v == null ? "–" : `${v}%`);
  const dist = { low: all.filter((m) => m.progress < 40).length, mid: all.filter((m) => m.progress >= 40 && m.progress < 70).length, high: all.filter((m) => m.progress >= 70).length };
  const started = data.sessionsHeld > 0 || all.some((m) => m.baselineEntered > 0);

  return (
    <div className="space-y-6">
      {exportBase && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          <span className="text-xs text-slate-500">Report for the sales head:</span>
          <a href={dl("pdf")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Download PDF</a>
          <a href={dl("csv")} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">Download CSV</a>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Managers" value={k.managers} sub={`${data.sessionsHeld} of ${data.sessions.length} sessions held`} />
        <Kpi label="Avg progress" value={pctText(k.avgProgress)} />
        <Kpi label="Attendance" value={pctText(k.attendancePct)} />
        <Kpi label="Assignments done" value={pctText(k.assignmentsPct)} />
        <Kpi label="Baseline complete" value={pctText(k.baselinePct)} sub="all four measures" />
        <Kpi label="Improving on 3+" value={`${k.improvingOn3Plus} of ${k.managers}`} sub={k.endlinePct ? `${k.endlinePct}% have an endline` : "after the endline"} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">What moved: baseline to endline</h2>
        <p className="mt-0.5 text-xs text-slate-500">Cohort averages of the four agreed measures. Once endlines come in, both columns cover only the managers who have both, so the movement matches. We track movement in behaviour, not revenue.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Measure</th><th className="px-3 font-medium">Baseline</th><th className="px-3 font-medium">Endline</th><th className="px-3 font-medium">Movement</th><th className="px-3 font-medium">Improved</th>
              </tr>
            </thead>
            <tbody>
              {data.rollup.per.map((p) => (
                <tr key={p.key} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-3 pr-3 font-medium text-slate-800 dark:text-slate-200">{p.label}</td>
                  <td className="px-3 tabular-nums">{p.baselineAvg ?? "–"}</td>
                  <td className="px-3 tabular-nums">{p.endlineAvg ?? "–"}</td>
                  <td className={`px-3 tabular-nums font-medium ${p.avgMovement == null ? "text-slate-400" : p.avgMovement > 0 ? "text-emerald-700" : p.avgMovement < 0 ? "text-rose-700" : "text-slate-600"}`}>{signed(p.avgMovement)}</td>
                  <td className="px-3 tabular-nums text-slate-600">{p.measured ? `${p.improved} of ${p.measured}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data.audit.managersAudited > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Pipeline audit</h2><p className="mt-0.5 text-xs text-slate-500">{data.audit.managersAudited} of {k.managers} managers have audited their open deals. The longest bar is the pipeline habit the cohort should fix first.</p></div>
            <p className="text-sm text-slate-600">Average score <b className="text-slate-900 dark:text-slate-100">{data.audit.avgScore ?? "–"} of 9</b></p>
          </div>
          <ul className="mt-4 space-y-2.5">
            {AUDIT_CHECKS.map((label, i) => (
              <li key={label} className="text-sm">
                <div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">{i + 1}. {label}</span><span className="tabular-nums text-slate-500">{data.audit.noPct[i] ?? 0}% No</span></div>
                <div className="mt-1"><Bar pct={data.audit.noPct[i] ?? 0} tone={i === data.audit.weakestIndex ? "rose" : "slate"} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.callStats.calls > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Call quality</h2><p className="mt-0.5 text-xs text-slate-500">{data.callStats.calls} calls scored by {data.callStats.managersScoring} of {k.managers} managers. The lowest-rated criterion is where the cohort&apos;s coaching should start.</p></div>
            <p className="text-sm text-slate-600">Average score <b className="text-slate-900 dark:text-slate-100">{data.callStats.avgScore ?? "–"} of 100</b></p>
          </div>
          <ul className="mt-4 space-y-2.5">
            {data.callStats.perCriterion.map((c) => (
              <li key={c.key} className="text-sm">
                <div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">{c.label}</span><span className="tabular-nums text-slate-500">{c.avgRating ?? "–"} of 5</span></div>
                <div className="mt-1"><Bar pct={((c.avgRating ?? 0) / 5) * 100} tone={c.key === data.callStats.weakestKey ? "rose" : "teal"} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.calibration.compared > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Calibration</h2><p className="mt-0.5 text-xs text-slate-500">{data.calibration.compared} call{data.calibration.compared === 1 ? "" : "s"} scored by two managers. This shows where managers disagree about what good looks like: the share of calls on which two managers were 2 or more points apart.</p></div>
            <p className="text-sm text-slate-600">Average gap <b className="text-slate-900 dark:text-slate-100">{data.calibration.avgGap ?? "–"}</b></p>
          </div>
          <ul className="mt-4 space-y-2.5">
            {data.calibration.per.map((c) => (
              <li key={c.key} className="text-sm">
                <div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">{c.label}</span><span className="tabular-nums text-slate-500">{c.bigGapPct ?? 0}% of calls 2+ apart</span></div>
                <div className="mt-1"><Bar pct={c.bigGapPct ?? 0} tone={c.key === data.calibration.mostDisagreedKey ? "rose" : "slate"} /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.forecastStats.months > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Forecast accuracy</h2><p className="mt-0.5 text-xs text-slate-500">{data.forecastStats.months} manager-months from {data.forecastStats.managers} of {k.managers} managers. Accurate means actual landed within {data.band.low} to {data.band.high}% of the month-start commit.</p></div>
            <p className="text-sm text-slate-600">Average accuracy <b className="text-slate-900 dark:text-slate-100">{data.forecastStats.avgAccuracy ?? "–"}%</b></p>
          </div>
          <ul className="mt-4 space-y-2.5 text-sm">
            <li><div className="flex justify-between"><span>Accurate</span><span className="tabular-nums text-slate-500">{data.forecastStats.withinBandPct ?? 0}%</span></div><div className="mt-1"><Bar pct={data.forecastStats.withinBandPct ?? 0} tone="teal" /></div></li>
            <li><div className="flex justify-between"><span>Over-called (actual below the commit)</span><span className="tabular-nums text-slate-500">{data.forecastStats.overPct ?? 0}%</span></div><div className="mt-1"><Bar pct={data.forecastStats.overPct ?? 0} tone="rose" /></div></li>
            <li><div className="flex justify-between"><span>Under-called (actual above the commit)</span><span className="tabular-nums text-slate-500">{data.forecastStats.underPct ?? 0}%</span></div><div className="mt-1"><Bar pct={data.forecastStats.underPct ?? 0} tone="amber" /></div></li>
          </ul>
        </section>
      )}

      {fs.cost.managers > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">The cost of weak sales management</h2>
          <p className="mt-0.5 text-xs text-slate-500">{fs.cost.managers} of {k.managers} managers entered their own numbers: averages across their teams, and the attrition cost added up.</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[[COST_FIELDS[0].label, fs.cost.avgMissedFollowups == null ? "–" : `${fs.cost.avgMissedFollowups}%`], [COST_FIELDS[1].label, fs.cost.avgLowConversion == null ? "–" : `${fs.cost.avgLowConversion}%`], [COST_FIELDS[2].label, fs.cost.avgForecastGap == null ? "–" : `${fs.cost.avgForecastGap}%`], ["Revenue per rep (avg)", rs(fs.cost.avgRevenuePerRep)], ["Reps lost in 12 months", String(fs.cost.repsLost)], ["Cost of avoidable attrition", rs(fs.cost.totalAttritionCost)]].map(([l, v]) => (
              <div key={l} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50"><dt className="text-xs text-slate-500">{l}</dt><dd className="mt-0.5 text-base font-semibold text-slate-900 dark:text-slate-100">{v}</dd></div>
            ))}
          </dl>
        </section>
      )}

      {(fs.cadence.weeks > 0 || fs.onboarding.plans > 0 || fs.charter.items > 0 || fs.reflections.notes > 0) && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Habits and routines</h2>
          <p className="mt-0.5 text-xs text-slate-500">Whether managers are building the routines the programme teaches.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {fs.cadence.weeks > 0 && <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-sm font-medium">Follow-up cadence</p><p className="mt-1 text-2xl font-semibold">{fs.cadence.avgPct ?? "–"}{fs.cadence.avgPct != null && "%"}</p><p className="text-xs text-slate-500">of sampled deals had a dated next step, across {fs.cadence.weeks} weekly checks by {fs.cadence.managers} of {k.managers} managers</p></div>}
            {fs.reflections.notes > 0 && <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-sm font-medium">Weekly reflection</p><p className="mt-1 text-2xl font-semibold">{fs.reflections.steady} of {k.managers}</p><p className="text-xs text-slate-500">managers wrote a note in at least 3 of the last 4 weeks ({fs.reflections.notes} notes in all). Likely causes named: skill {fs.reflections.causes.skill}, will {fs.reflections.causes.will}, system {fs.reflections.causes.system}</p></div>}
            {fs.charter.items > 0 && <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-sm font-medium">90-day charters</p><p className="mt-1 text-2xl font-semibold">{fs.charter.withResult} of {fs.charter.items}</p><p className="text-xs text-slate-500">priorities have a result recorded, from {fs.charter.managers} of {k.managers} managers{fs.charter.reviewOverdue > 0 ? ` · ${fs.charter.reviewOverdue} past their review date with no result` : ""}</p></div>}
            {fs.onboarding.plans > 0 && <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/50"><p className="text-sm font-medium">New-rep onboarding</p><p className="mt-1 text-2xl font-semibold">{fs.onboarding.plans} plan{fs.onboarding.plans === 1 ? "" : "s"}</p><p className="text-xs text-slate-500">{fs.onboarding.active} in their first 90 days · weekly checks logged {fs.onboarding.loggedPct ?? "–"}{fs.onboarding.loggedPct != null && "%"} of those expected</p></div>}
          </div>
        </section>
      )}

      {data.planStats.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Performance plans</h2><p className="mt-0.5 text-xs text-slate-500">{data.planStats.total} 30-day plans from {data.planStats.managers} of {k.managers} managers. Counts only: the content of any plan stays private to the manager.</p></div>
            <p className="text-sm text-slate-600">Reviews held when due <b className="text-slate-900 dark:text-slate-100">{data.planStats.reviewsDuePct ?? "–"}{data.planStats.reviewsDuePct != null && "%"}</b>{data.planStats.overdueReviews > 0 && <span className="ml-2 text-xs text-rose-700">{data.planStats.overdueReviews} overdue</span>}</p>
          </div>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[["Open", data.planStats.open, "slate"], ["Standard met", data.planStats.met, "teal"], ["Standard not met", data.planStats.notMet, "amber"], ["Closed for another reason", data.planStats.closed, "slate"]].map(([label, n, tone]) => (
              <li key={label as string}><div className="flex justify-between"><span>{label as string}</span><span className="tabular-nums text-slate-500">{n as number} of {data.planStats.total}</span></div><div className="mt-1"><Bar pct={((n as number) / data.planStats.total) * 100} tone={tone as "teal" | "amber" | "slate"} /></div></li>
            ))}
          </ul>
        </section>
      )}

      {data.bandingStats.reps > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Where coaching time should go</h2><p className="mt-0.5 text-xs text-slate-500">{data.bandingStats.reps} reps banded by {data.bandingStats.managers} of {k.managers} managers. Each rep is compared with their own tenure band, and the focus is split three ways. This is for deciding where coaching goes, not for ranking people.</p></div>
          </div>
          {data.bandingStats.rated > 0 ? (
            <ul className="mt-4 space-y-2.5 text-sm">
              <li><div className="flex justify-between"><span>Below {data.bandingSetup.cut.low}% of band average: diagnose skill, will or system</span><span className="tabular-nums text-slate-500">{data.bandingStats.diagnose} of {data.bandingStats.rated}</span></div><div className="mt-1"><Bar pct={(data.bandingStats.diagnose / data.bandingStats.rated) * 100} tone="amber" /></div></li>
              <li><div className="flex justify-between"><span>{data.bandingSetup.cut.low} to {data.bandingSetup.cut.high}%: in band, stretch</span><span className="tabular-nums text-slate-500">{data.bandingStats.stretch} of {data.bandingStats.rated}</span></div><div className="mt-1"><Bar pct={(data.bandingStats.stretch / data.bandingStats.rated) * 100} tone="slate" /></div></li>
              <li><div className="flex justify-between"><span>Above {data.bandingSetup.cut.high}%: learn from them and retain them</span><span className="tabular-nums text-slate-500">{data.bandingStats.learn} of {data.bandingStats.rated}</span></div><div className="mt-1"><Bar pct={(data.bandingStats.learn / data.bandingStats.rated) * 100} tone="teal" /></div></li>
            </ul>
          ) : <p className="mt-3 text-sm text-slate-500">Reps are listed but there is not yet enough output data to compare within a band.</p>}
        </section>
      )}

      {data.oneOnOneStats.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">One-on-ones</h2><p className="mt-0.5 text-xs text-slate-500">{data.oneOnOneStats.total} one-on-ones recorded by {data.oneOnOneStats.managers} of {k.managers} managers, covering {data.oneOnOneStats.reps} reps. {data.oneOnOneStats.commitments} commitments made, {data.oneOnOneStats.answered} checked.</p></div>
            <p className="text-sm text-slate-600">Commitments done on time <b className="text-slate-900 dark:text-slate-100">{data.oneOnOneStats.doneOnTimePct ?? "–"}{data.oneOnOneStats.doneOnTimePct != null && "%"}</b>{data.oneOnOneStats.overdueOpen > 0 && <span className="ml-2 text-xs text-rose-700">{data.oneOnOneStats.overdueOpen} overdue and unchecked</span>}</p>
          </div>
          {data.oneOnOneStats.doneOnTimePct != null && <div className="mt-4"><Bar pct={data.oneOnOneStats.doneOnTimePct} tone={toneFor(data.oneOnOneStats.doneOnTimePct)} /></div>}
        </section>
      )}

      {data.coachingStats.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Coaching</h2><p className="mt-0.5 text-xs text-slate-500">{data.coachingStats.total} coaching conversations prepared by {data.coachingStats.managers} of {k.managers} managers, covering {data.coachingStats.reps} reps. What managers find behind the gaps they coach on.</p></div>
            <div className="text-right text-sm text-slate-600">{data.coachingStats.systemSharePct != null && <p>System gaps <b className="text-slate-900 dark:text-slate-100">{data.coachingStats.systemSharePct}%</b></p>}{data.coachingStats.followUps > 0 && <p className="text-xs">Follow-ups done {data.coachingStats.followedUp} of {data.coachingStats.followUps}{data.coachingStats.overdue > 0 ? ` · ${data.coachingStats.overdue} overdue` : ""}</p>}</div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {ROOT_CAUSES.map((c) => {
              const n = data.coachingStats.gaps[c.key] ?? 0;
              return (
                <li key={c.key} className="text-sm">
                  <div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">{c.label} <span className="text-xs text-slate-400">· {c.hint}</span></span><span className="tabular-nums text-slate-500">{n} of {data.coachingStats.total}</span></div>
                  <div className="mt-1"><Bar pct={(n / data.coachingStats.total) * 100} tone={c.key === "system" ? "teal" : "slate"} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.reviewStats.total > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Review meetings</h2><p className="mt-0.5 text-xs text-slate-500">{data.reviewStats.total} reviews prepared by {data.reviewStats.managers} of {k.managers} managers. Whether actions reach the company system, and what managers think is behind the exceptions.</p></div>
            <div className="text-right text-sm text-slate-600"><p>Actions logged in the company system <b className="text-slate-900 dark:text-slate-100">{data.reviewStats.actionLoggedPct ?? "–"}{data.reviewStats.actionLoggedPct != null && "%"}</b></p>{data.reviewStats.followUps > 0 && <p className="text-xs">Follow-ups done {data.reviewStats.followedUp} of {data.reviewStats.followUps}{data.reviewStats.overdue > 0 ? ` · ${data.reviewStats.overdue} overdue` : ""}</p>}</div>
          </div>
          <ul className="mt-4 space-y-2.5">
            {ROOT_CAUSES.map((c) => {
              const n = data.reviewStats.causes[c.key] ?? 0;
              return (
                <li key={c.key} className="text-sm">
                  <div className="flex justify-between"><span className="text-slate-700 dark:text-slate-300">{c.label} <span className="text-xs text-slate-400">· {c.hint}</span></span><span className="tabular-nums text-slate-500">{n} of {data.reviewStats.total}</span></div>
                  <div className="mt-1"><Bar pct={(n / data.reviewStats.total) * 100} tone={c.key === "system" ? "teal" : "slate"} /></div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Attendance by session</h2>
          <div className="mt-4 space-y-3">
            {data.sessions.map((s) => {
              const present = data.attendance.filter((a) => a.session_id === s.id && a.present && all.some((m) => m.member.id === a.member_id)).length;
              const marked = data.attendance.some((a) => a.session_id === s.id);
              const pct = all.length ? Math.round((present / all.length) * 100) : 0;
              return (
                <div key={s.id}>
                  <div className="flex justify-between text-sm"><span className="text-slate-700 dark:text-slate-300">{s.n}. {s.title}</span><span className="tabular-nums text-slate-500">{marked ? `${present} of ${all.length}` : s.held_on ? "Scheduled" : "Not yet"}</span></div>
                  <div className="mt-1"><Bar pct={marked ? pct : 0} tone="teal" /></div>
                </div>
              );
            })}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Progress spread</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between"><dt className="text-slate-600">On track (70+)</dt><dd className="font-semibold text-emerald-700">{dist.high}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-slate-600">In progress (40 to 69)</dt><dd className="font-semibold text-amber-700">{dist.mid}</dd></div>
            <div className="flex items-center justify-between"><dt className="text-slate-600">Needs attention (under 40)</dt><dd className="font-semibold text-rose-700">{dist.low}</dd></div>
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Progress by manager</h2>
        <p className="mt-0.5 text-xs text-slate-500">Lowest progress first. Progress combines details added, baseline, attendance, assignments and endline.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Manager</th><th className="px-3 font-medium">Progress</th><th className="px-3 font-medium">Attended</th><th className="px-3 font-medium">Assignments</th><th className="px-3 font-medium">Baseline</th><th className="px-3 font-medium">Audit</th><th className="px-3 font-medium">Call score</th><th className="px-3 font-medium">Forecast</th><th className="px-3 font-medium">Improved</th><th className="px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.member.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-3 pr-3">
                    <Link href={memberHref(m.member.id)} className="font-medium text-teal-700 hover:underline dark:text-teal-400">{m.member.full_name ?? m.member.email}</Link>
                    <p className="text-xs text-slate-500">{m.member.profile.designation ?? ""}</p>
                  </td>
                  <td className="px-3"><div className="flex items-center gap-2"><div className="w-24"><Bar pct={m.progress} tone={toneFor(m.progress)} /></div><span className="tabular-nums text-slate-600">{m.progress}%</span></div></td>
                  <td className="px-3 tabular-nums text-slate-600">{data.sessionsHeld ? `${m.attended} of ${data.sessionsHeld}` : "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{data.sessionsHeld ? `${m.assignmentsDone} of ${data.sessionsHeld}` : "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.baselineEntered} of {MEASURES.length}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.calls.avgScore ?? "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.forecast.avgAccuracy != null ? `${m.forecast.avgAccuracy}%` : "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.audit.avgScore != null ? `${m.audit.avgScore} of 9` : "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.endlineEntered ? `${m.improved} of ${MEASURES.length}` : "–"}</td>
                  <td className="px-3"><StatusChip progress={m.progress} started={started} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="py-6 text-center text-slate-500">No managers in the cohort yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
