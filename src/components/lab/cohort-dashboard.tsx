import Link from "next/link";
import { AUDIT_CHECKS, MEASURES } from "@/lib/lab/calc";
import type { CohortData } from "@/lib/lab/data";
import { Bar, Kpi, StatusChip, signed, toneFor } from "./ui";

// The cohort view for sales heads, management and the facilitator: how far the cohort has got, what moved, and who
// needs a nudge. Each manager links to their own progress page.
export default function CohortDashboard({ data, memberHref, onlyIds }: { data: CohortData; memberHref: (id: string) => string; onlyIds?: Set<string> }) {
  const all = data.managers;
  const rows = (onlyIds ? all.filter((m) => onlyIds.has(m.member.id)) : all).slice().sort((a, b) => a.progress - b.progress);
  const k = data.kpis;
  const pctText = (v: number | null) => (v == null ? "–" : `${v}%`);
  const dist = { low: all.filter((m) => m.progress < 40).length, mid: all.filter((m) => m.progress >= 40 && m.progress < 70).length, high: all.filter((m) => m.progress >= 70).length };
  const started = data.sessionsHeld > 0 || all.some((m) => m.baselineEntered > 0);

  return (
    <div className="space-y-6">
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
        <p className="mt-0.5 text-xs text-slate-500">Cohort averages of the four agreed measures. We track movement in behaviour, not revenue.</p>
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
          <table className="w-full min-w-[780px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3 font-medium">Manager</th><th className="px-3 font-medium">Progress</th><th className="px-3 font-medium">Attended</th><th className="px-3 font-medium">Assignments</th><th className="px-3 font-medium">Baseline</th><th className="px-3 font-medium">Audit</th><th className="px-3 font-medium">Improved</th><th className="px-3 font-medium">Status</th>
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
                  <td className="px-3 tabular-nums text-slate-600">{m.audit.avgScore != null ? `${m.audit.avgScore} of 9` : "–"}</td>
                  <td className="px-3 tabular-nums text-slate-600">{m.endlineEntered ? `${m.improved} of ${MEASURES.length}` : "–"}</td>
                  <td className="px-3"><StatusChip progress={m.progress} started={started} /></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-slate-500">No managers in the cohort yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
