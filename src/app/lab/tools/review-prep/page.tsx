import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../portal-header";
import ReviewPrep, { type Saved } from "./review-prep";

export const dynamic = "force-dynamic";

export default async function ReviewPrepPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_review_preps").select("id, met_on, report_used, exceptions, changed, root_cause, decision, owner_support, action_logged, follow_up_on, followed_up").eq("member_id", me.member.id).order("met_on", { ascending: false }).order("created_at", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; met_on: string; report_used: string | null; exceptions: string | null; changed: string | null; root_cause: string | null; decision: string | null; owner_support: string | null; action_logged: boolean | null; follow_up_on: string | null; followed_up: boolean }[]).map((r) => ({
    id: r.id, metOn: r.met_on, reportUsed: r.report_used ?? "", exceptions: r.exceptions ?? "", changed: r.changed ?? "", rootCause: r.root_cause ?? "", decision: r.decision ?? "", ownerSupport: r.owner_support ?? "", actionLogged: r.action_logged, followUpOn: r.follow_up_on ?? "", followedUp: r.followed_up,
  }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 3</p>
          <h1 className="text-2xl font-semibold tracking-tight">Review Meeting Prep</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Prepare for the review you already hold: the exceptions, what changed, your guess at the root cause, the decision you need, and the follow-up. A short prep makes the review change behaviour instead of just reporting status.</p>
        </div>
        <ReviewPrep saved={saved} />
      </main>
    </>
  );
}
