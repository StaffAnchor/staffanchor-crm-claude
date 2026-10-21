import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import { weightsFor } from "@/lib/lab/calc";
import PortalHeader from "../../portal-header";
import Scorecard, { type SavedCall } from "./scorecard";

export const dynamic = "force-dynamic";

export default async function CallScorecardPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_call_scores").select("id, rep_ref, call_ref, scored_on, ratings, note").eq("member_id", me.member.id).order("scored_on", { ascending: false }).order("created_at", { ascending: false });
  const calls: SavedCall[] = ((data ?? []) as { id: string; rep_ref: string; call_ref: string | null; scored_on: string; ratings: Record<string, number>; note: string | null }[]).map((r) => ({ id: r.id, repRef: r.rep_ref, callRef: r.call_ref ?? "", scoredOn: r.scored_on, ratings: r.ratings, note: r.note ?? "" }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 4</p>
          <h1 className="text-2xl font-semibold tracking-tight">Call Quality Scorecard</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Score sampled calls on seven criteria. Use the rep&apos;s ID and your system&apos;s call ID only: no names, recordings or transcripts. The weights were agreed with your sales head before the baseline and stay fixed.</p>
        </div>
        <Scorecard weights={weightsFor(me.cohort.config)} calls={calls} />
      </main>
    </>
  );
}
