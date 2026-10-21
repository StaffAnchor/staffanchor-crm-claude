import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../portal-header";
import AuditForm from "./audit-form";

export const dynamic = "force-dynamic";

export default async function PipelineAuditPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_audit_deals").select("position, deal_ref, answers, action").eq("member_id", me.member.id).order("position");
  const initial: { dealRef: string; answers: (boolean | null)[]; action: string }[] = [];
  for (const r of (data ?? []) as { position: number; deal_ref: string | null; answers: (boolean | null)[]; action: string | null }[]) {
    initial[r.position - 1] = { dealRef: r.deal_ref ?? "", answers: r.answers, action: r.action ?? "" };
  }
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 1</p>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline Audit</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Pick 10 open deals from your CRM view. Enter the CRM deal ID only, then answer Y or N for each of the nine checks. The score is worked out for you. Do not enter deal values or customer names here.</p>
        </div>
        <AuditForm initial={initial} />
      </main>
    </>
  );
}
