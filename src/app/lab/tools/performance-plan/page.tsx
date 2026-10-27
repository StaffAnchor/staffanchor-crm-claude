import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import type { PlanOutcome, PlanReview } from "@/lib/lab/calc";
import PortalHeader from "../../portal-header";
import Plans, { type Saved } from "./plans";

export const dynamic = "force-dynamic";

export default async function PerformancePlanPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_perf_plans").select("id, rep_ref, started_on, gap, standard, support, reviews, outcome").eq("member_id", me.member.id).order("started_on", { ascending: false }).order("created_at", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; rep_ref: string; started_on: string; gap: string | null; standard: string | null; support: string | null; reviews: PlanReview[]; outcome: PlanOutcome }[]).map((r) => ({ id: r.id, repRef: r.rep_ref, startedOn: r.started_on, gap: r.gap ?? "", standard: r.standard ?? "", support: r.support ?? "", reviews: r.reviews ?? [], outcome: r.outcome }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 5</p>
          <h1 className="text-2xl font-semibold tracking-tight">30-day Performance Plan</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">For a rep who is not achieving: the gap as a fact, the standard you expect in 30 days, the support you will give, and reviews at day 10, 20 and 30.</p>
        </div>
        <Plans saved={saved} />
      </main>
    </>
  );
}
