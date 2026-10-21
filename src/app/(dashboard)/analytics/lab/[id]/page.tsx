import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadCohort } from "@/lib/lab/data";
import CohortDashboard from "@/components/lab/cohort-dashboard";
import { AddMemberForm, AttendanceCell, InviteAll, MemberActions, ReportsToSelect, ScorecardWeights, SessionDate } from "../lab-admin-forms";

export const dynamic = "force-dynamic";

const ROLE = { manager: "Manager", sales_head: "Sales head", management: "Management", facilitator: "Facilitator" } as const;

export default async function CohortAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  if (!db) return <p>Not configured.</p>;
  const data = await loadCohort(db, id);
  if (!data) notFound();
  const heads = data.members.filter((m) => m.role === "sales_head").map((m) => ({ id: m.id, name: m.full_name ?? m.email }));
  const { data: invited } = await db.from("lab_members").select("id, invited_at, last_login_at").eq("cohort_id", id);
  const inv = new Map(((invited ?? []) as { id: string; invited_at: string | null; last_login_at: string | null }[]).map((r) => [r.id, r]));
  const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "–");
  const att = (sid: string, mid: string) => data.attendance.find((a) => a.session_id === sid && a.member_id === mid)?.present ?? null;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/analytics/lab" className="text-xs text-slate-500 hover:text-slate-800">← All cohorts</Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{data.cohort.company_name} <span className="font-normal text-slate-500">· {data.cohort.name}</span></h2>
        <p className="text-sm text-slate-500">Portal for participants and stakeholders: <span className="font-medium">clients.staffanchor.com/lab</span></p>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-base font-semibold">People</h3><InviteAll ids={data.members.map((m) => m.id)} /></div>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2 font-medium">Name</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Reports to</th><th className="px-3 font-medium">Invited</th><th className="px-3 font-medium">Last sign-in</th><th className="px-3 font-medium" /></tr></thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5"><p className="font-medium text-slate-800 dark:text-slate-200">{m.full_name ?? "(name not added yet)"}</p><p className="text-xs text-slate-500">{m.email}</p></td>
                  <td className="px-3">{ROLE[m.role]}</td>
                  <td className="px-3">{m.role === "manager" ? <ReportsToSelect memberId={m.id} value={m.reports_to ?? ""} heads={heads} /> : <span className="text-slate-400">–</span>}</td>
                  <td className="px-3 text-slate-600">{fmt(inv.get(m.id)?.invited_at)}</td>
                  <td className="px-3 text-slate-600">{fmt(inv.get(m.id)?.last_login_at)}</td>
                  <td className="px-3"><MemberActions memberId={m.id} /></td>
                </tr>
              ))}
              {data.members.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-500">Add the sales head, founder or management first, then the managers.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><AddMemberForm cohortId={id} heads={heads} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Sessions and attendance</h3>
        <p className="text-xs text-slate-500">A session counts as held once its date has passed or attendance is marked. P is present, A is absent.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2 font-medium">Manager</th>{data.sessions.map((s) => <th key={s.id} className="px-2 text-center font-medium" title={s.title}>S{s.n}</th>)}</tr>
              <tr className="text-xs"><td className="px-4 pb-2 text-slate-500">Date</td>{data.sessions.map((s) => <td key={s.id} className="px-1 pb-2"><SessionDate sessionId={s.id} value={s.held_on ?? ""} /></td>)}</tr></thead>
            <tbody>
              {data.managers.map((m) => (
                <tr key={m.member.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2">{m.member.full_name ?? m.member.email}</td>
                  {data.sessions.map((s) => <td key={s.id} className="px-2 text-center"><AttendanceCell sessionId={s.id} memberId={m.member.id} value={att(s.id, m.member.id)} /></td>)}
                </tr>
              ))}
              {data.managers.length === 0 && <tr><td colSpan={data.sessions.length + 1} className="px-4 py-5 text-center text-slate-500">Add managers to mark attendance.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Call Quality Scorecard weights</h3>
        <p className="text-xs text-slate-500">Starting weights add to 100. Agree any change with the sales head before the baseline, then lock them so before and after stay comparable.</p>
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><ScorecardWeights cohortId={id} weights={data.weights} locked={data.cohort.config.scorecard_locked === true} /></div>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Cohort analytics</h3>
        <p className="text-xs text-slate-500">This is what the sales head and management see when they sign in.</p>
        <CohortDashboard data={data} memberHref={(mid) => `/analytics/lab/${id}/m/${mid}`} />
      </section>
    </div>
  );
}
