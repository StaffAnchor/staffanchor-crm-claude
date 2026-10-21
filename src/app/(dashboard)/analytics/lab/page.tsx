import Link from "next/link";
import { adminDb } from "@/lib/pro-sessions/core";
import { CreateCohortForm } from "./lab-admin-forms";

export const dynamic = "force-dynamic";

export default async function LabCohortsPage() {
  const db = adminDb();
  const { data: cohorts } = db ? await db.from("lab_cohorts").select("id, company_name, name, start_date, status, created_at").order("created_at", { ascending: false }) : { data: [] };
  const { data: members } = db ? await db.from("lab_members").select("cohort_id, role").eq("active", true) : { data: [] };
  const count = (id: string, role?: string) => ((members ?? []) as { cohort_id: string; role: string }[]).filter((m) => m.cohort_id === id && (!role || m.role === role)).length;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Sales Leaders Lab</h2>
        <p className="text-sm text-slate-500">Cohorts you run for client companies. Participants sign in at <span className="font-medium">clients.staffanchor.com/lab</span> with an emailed code.</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"><h3 className="mb-3 text-sm font-semibold">New cohort</h3><CreateCohortForm /></div>
      <div className="space-y-2">
        {(cohorts ?? []).map((c: { id: string; company_name: string; name: string; start_date: string | null }) => (
          <Link key={c.id} href={`/analytics/lab/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900">
            <div><p className="font-semibold text-slate-900 dark:text-slate-100">{c.company_name}</p><p className="text-xs text-slate-500">{c.name}{c.start_date ? ` · starts ${c.start_date}` : ""}</p></div>
            <p className="text-sm text-slate-600">{count(c.id, "manager")} managers · {count(c.id) - count(c.id, "manager")} stakeholders</p>
          </Link>
        ))}
        {(cohorts ?? []).length === 0 && <p className="text-sm text-slate-500">No cohorts yet. Create the first one above.</p>}
      </div>
    </div>
  );
}
