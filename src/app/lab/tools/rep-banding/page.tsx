import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { bandingFor } from "@/lib/lab/calc";
import PortalHeader from "../../portal-header";
import Banding, { type Row } from "./banding";

export const dynamic = "force-dynamic";

export default async function RepBandingPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_reps").select("rep_ref, tenure_months, output").eq("member_id", me.member.id).order("rep_ref");
  const rows: Row[] = ((data ?? []) as { rep_ref: string; tenure_months: number; output: number | null }[]).map((r) => ({ repRef: r.rep_ref, tenure: String(Number(r.tenure_months)), output: r.output == null ? "" : String(Number(r.output)) }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 5</p>
          <h1 className="text-2xl font-semibold tracking-tight">Rep Banding by tenure</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Compare reps with others of similar tenure, not with the whole team. A new rep and a three-year veteran should not be judged on the same number. Use rep IDs, and a monthly output figure you already report.</p>
        </div>
        <Banding initial={rows} unit={me.member.profile.banding_unit ?? ""} setup={bandingFor(me.cohort.config)} />
      </main>
    </>
  );
}
