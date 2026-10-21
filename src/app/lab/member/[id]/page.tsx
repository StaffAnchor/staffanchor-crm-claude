import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember, isLeader } from "@/lib/lab/auth";
import { loadCohort } from "@/lib/lab/data";
import MemberProgress from "@/components/lab/member-progress";
import PortalHeader from "../../portal-header";

export const dynamic = "force-dynamic";

// One manager's progress. Leaders (sales head, management, facilitator) can open anyone in their cohort; a manager
// can only open their own.
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  const { id } = await params;
  if (!isLeader(me.member.role) && me.member.id !== id) notFound();
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const data = await loadCohort(db, me.cohort.id);
  const m = data?.managers.find((x) => x.member.id === id);
  if (!data || !m) notFound();
  const { data: asg } = await db.from("lab_assignments").select("session_n, done").eq("member_id", id);
  const assignments: Record<number, boolean> = {};
  for (const a of (asg ?? []) as { session_n: number; done: boolean }[]) assignments[a.session_n] = a.done;
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role={me.member.role.replace("_", " ")} />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← Cohort progress</Link>
        <div><h1 className="text-2xl font-semibold tracking-tight">{m.member.full_name ?? m.member.email}</h1><p className="text-sm text-slate-600 dark:text-slate-300">{[m.member.profile.designation, m.member.profile.function, m.member.profile.city].filter(Boolean).join(" · ")}{m.member.profile.team_size ? ` · team of ${m.member.profile.team_size}` : ""}</p></div>
        <MemberProgress m={m} data={data} assignments={assignments} />
      </main>
    </>
  );
}
