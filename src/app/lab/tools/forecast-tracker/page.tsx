import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { bandFor } from "@/lib/lab/calc";
import PortalHeader from "../../portal-header";
import Tracker, { type Row } from "./tracker";

export const dynamic = "force-dynamic";

export default async function ForecastTrackerPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_forecast_months").select("month, commit, best_case, actual, why").eq("member_id", me.member.id).order("month");
  const s = (v: number | string | null) => (v == null ? "" : String(Number(v)));
  const rows: Row[] = ((data ?? []) as { month: string; commit: number | null; best_case: number | null; actual: number | null; why: string | null }[]).map((r) => ({ month: r.month.slice(0, 7), commit: s(r.commit), bestCase: s(r.best_case), actual: s(r.actual), why: r.why ?? "" }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 3</p>
          <h1 className="text-2xl font-semibold tracking-tight">Forecast Tracker</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Two numbers a month: the commit you gave at month start and the actual, taken from your existing reports. Accuracy and the read are calculated. Give the commit at the start of the month, not after, so the tracker stays honest.</p>
        </div>
        <Tracker initial={rows} unit={me.member.profile.forecast_unit ?? ""} band={bandFor(me.cohort.config)} />
      </main>
    </>
  );
}
