import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember, isLeader } from "@/lib/lab/auth";
import { loadCohort } from "@/lib/lab/data";
import { MEASURES } from "@/lib/lab/calc";
import CohortDashboard from "@/components/lab/cohort-dashboard";
import MemberProgress from "@/components/lab/member-progress";
import PortalHeader from "../portal-header";
import { AssignmentToggle, MeasuresForm, ProfileForm, type InitialValues } from "./participant-panels";

export const dynamic = "force-dynamic";

const ROLE_LABEL = { manager: "Manager", sales_head: "Sales head", management: "Management", facilitator: "Facilitator" } as const;

const TOOLS: { name: string; when: string; live?: boolean; href?: string }[] = [
  { name: "Baseline & Endline", when: "Before session 1 and at session 6", live: true },
  { name: "Pipeline Audit", when: "Session 1", live: true, href: "/lab/tools/pipeline-audit" }, { name: "Follow-up Cadence", when: "Session 2" }, { name: "Forecast Tracker", when: "Session 3", live: true, href: "/lab/tools/forecast-tracker" },
  { name: "Review Meeting Prep", when: "Session 3", live: true, href: "/lab/tools/review-prep" }, { name: "One-on-One Agenda", when: "Sessions 3 and 4" }, { name: "Coaching Prep", when: "Session 4", live: true, href: "/lab/tools/coaching-prep" },
  { name: "Call Quality Scorecard", when: "Session 4", live: true, href: "/lab/tools/call-scorecard" }, { name: "Calibration", when: "Session 4", live: true, href: "/lab/tools/calibration" }, { name: "Rep Banding", when: "Session 5" },
  { name: "Performance Plan", when: "Session 5" }, { name: "Onboarding 30-60-90", when: "Session 5" }, { name: "90-Day Charter", when: "Session 6" }, { name: "Weekly Reflection", when: "Every week" },
];

export default async function LabHome({ searchParams }: { searchParams: Promise<{ team?: string }> }) {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const data = await loadCohort(db, me.cohort.id);
  if (!data) return <p className="p-8">This cohort isn&apos;t available.</p>;
  const { member } = me;
  const header = <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={member.full_name ?? member.email} role={ROLE_LABEL[member.role]} />;

  if (isLeader(member.role)) {
    const team = (await searchParams).team === "mine";
    const mine = new Set(data.managers.filter((m) => m.member.reports_to === member.id).map((m) => m.member.id));
    const showTeamToggle = member.role === "sales_head" && mine.size > 0;
    return (
      <>
        {header}
        <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h1 className="text-2xl font-semibold tracking-tight">Cohort progress</h1><p className="text-sm text-slate-600 dark:text-slate-300">How {me.cohort.company_name}&apos;s managers are moving through the programme.</p></div>
            {showTeamToggle && (
              <div className="flex gap-1 rounded-full bg-white p-1 text-sm ring-1 ring-slate-200">
                <a href="/lab/home" className={`rounded-full px-3 py-1 ${!team ? "bg-teal-700 text-white" : "text-slate-600"}`}>Whole cohort</a>
                <a href="/lab/home?team=mine" className={`rounded-full px-3 py-1 ${team ? "bg-teal-700 text-white" : "text-slate-600"}`}>My team</a>
              </div>
            )}
          </div>
          <CohortDashboard data={data} memberHref={(id) => `/lab/member/${id}`} onlyIds={team ? mine : undefined} />
        </main>
      </>
    );
  }

  // A manager: their own details, tools and progress, with anonymous cohort averages.
  const mm = data.managers.find((x) => x.member.id === member.id);
  if (!mm) return <p className="p-8">Your profile isn&apos;t available.</p>;
  const { data: valRows } = await db.from("lab_measure_values").select("measure_key, phase, value, period, source, note").eq("member_id", member.id);
  const initial: InitialValues = Object.fromEntries(MEASURES.map((m) => [m.key, { baseline: { value: "", period: "", source: "", note: "" }, endline: { value: "", period: "", source: "", note: "" } }]));
  for (const r of (valRows ?? []) as { measure_key: string; phase: "baseline" | "endline"; value: number | null; period: string | null; source: string | null; note: string | null }[]) {
    if (initial[r.measure_key]) initial[r.measure_key][r.phase] = { value: r.value == null ? "" : String(r.value), period: r.period ?? "", source: r.source ?? "", note: r.note ?? "" };
  }
  const { data: asg } = await db.from("lab_assignments").select("session_n, done").eq("member_id", member.id);
  const assignments: Record<number, boolean> = {};
  for (const a of (asg ?? []) as { session_n: number; done: boolean }[]) assignments[a.session_n] = a.done;
  const p = member.profile;

  return (
    <>
      {header}
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <div><h1 className="text-2xl font-semibold tracking-tight">Welcome{member.full_name ? `, ${member.full_name.split(/\s+/)[0]}` : ""}</h1><p className="text-sm text-slate-600 dark:text-slate-300">Add your details, enter your baseline, and track your progress. Your sales head and the programme team can see your progress.</p></div>
        <MemberProgress m={mm} data={data} assignments={assignments} />
        <ProfileForm done={!!member.profile_done_at} initial={{ full_name: member.full_name ?? "", designation: p.designation ?? "", function: p.function ?? "", team_size: p.team_size ?? "", years_experience: p.years_experience ?? "", city: p.city ?? "", phone: p.phone ?? "" }} />
        <MeasuresForm initial={initial} phase="baseline" title="Your baseline" blurb="Agree these with your sales head before session 1. Use your existing definitions and reports. Percentages are plain numbers, for example 72 for 72%." />
        <MeasuresForm initial={initial} phase="endline" title="Your endline" blurb="Fill this in at session 6, using the same definitions and periods as your baseline. Change and result are calculated for you." />
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Between-session assignments</h2>
          <p className="mt-0.5 text-xs text-slate-500">Each session ends with one change to make on your own team. Mark it done when you have tried it.</p>
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"><span>{s.n}. {s.title}</span><AssignmentToggle sessionN={s.n} done={!!assignments[s.n]} /></li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold">Your toolkit</h2>
          <p className="mt-0.5 text-xs text-slate-500">Baseline &amp; Endline, the Pipeline Audit, the Call Quality Scorecard, Calibration, the Forecast Tracker, Review Meeting Prep and Coaching Prep are open now. The other tools are being added to this page one by one.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <li key={t.name} className={`rounded-xl px-3 py-2 text-sm ${t.live ? "bg-teal-50 text-teal-900 ring-1 ring-teal-200" : "bg-slate-50 text-slate-500 dark:bg-slate-800/50"}`}>
                {t.href ? <a href={t.href} className="block hover:underline"><span className="font-medium">{t.name}</span> <span className="text-xs">· {t.when} · open</span></a> : <><span className="font-medium">{t.name}</span> <span className="text-xs">· {t.when}{t.live ? " · open" : " · coming soon"}</span></>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </>
  );
}
