import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../portal-header";
import CoachingPrep, { type Saved } from "./coaching-prep";

export const dynamic = "force-dynamic";

export default async function CoachingPrepPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_coaching_preps").select("id, coached_on, rep_ref, record_ref, observed, gap, question, practice, commitment, follow_up_note, follow_up_on, followed_up").eq("member_id", me.member.id).order("coached_on", { ascending: false }).order("created_at", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; coached_on: string; rep_ref: string; record_ref: string | null; observed: string | null; gap: string | null; question: string | null; practice: string | null; commitment: string | null; follow_up_note: string | null; follow_up_on: string | null; followed_up: boolean }[]).map((r) => ({
    id: r.id, coachedOn: r.coached_on, repRef: r.rep_ref, recordRef: r.record_ref ?? "", observed: r.observed ?? "", gap: r.gap ?? "", question: r.question ?? "", practice: r.practice ?? "", commitment: r.commitment ?? "", followUpNote: r.follow_up_note ?? "", followUpOn: r.follow_up_on ?? "", followedUp: r.followed_up,
  }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 4</p>
          <h1 className="text-2xl font-semibold tracking-tight">Coaching Prep</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Prepare a coaching conversation: what you saw, what is behind it (skill, will or system), the question you will ask, the support you will give and what the rep commits to. Coach on facts, and fix the system first.</p>
        </div>
        <CoachingPrep saved={saved} />
      </main>
    </>
  );
}
