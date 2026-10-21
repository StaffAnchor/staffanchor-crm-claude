import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../portal-header";
import OneOnOne, { type Saved } from "./one-on-one";

export const dynamic = "force-dynamic";

export default async function OneOnOnePage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data } = await db.from("lab_oneonones").select("id, held_on, rep_ref, notes, commitment, due_on, done, my_follow_up").eq("member_id", me.member.id).order("held_on", { ascending: false }).order("created_at", { ascending: false });
  const saved: Saved[] = ((data ?? []) as { id: string; held_on: string; rep_ref: string; notes: Record<string, string>; commitment: string | null; due_on: string | null; done: boolean | null; my_follow_up: string | null }[]).map((r) => ({
    id: r.id, heldOn: r.held_on, repRef: r.rep_ref, notes: r.notes ?? {}, commitment: r.commitment ?? "", dueOn: r.due_on ?? "", done: r.done, myFollowUp: r.my_follow_up ?? "",
  }));
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Sessions 3 and 4</p>
          <h1 className="text-2xl font-semibold tracking-tight">One-on-One Agenda</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">A 30-minute structure for the one-on-ones you already hold, and a log of the commitment that comes out of each one. Keep it to one commitment, then check whether it was done by the agreed date.</p>
        </div>
        <OneOnOne saved={saved} />
      </main>
    </>
  );
}
