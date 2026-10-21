import Link from "next/link";
import { notFound } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadCohort } from "@/lib/lab/data";
import MemberProgress from "@/components/lab/member-progress";

export const dynamic = "force-dynamic";

export default async function AdminMemberPage({ params }: { params: Promise<{ id: string; memberId: string }> }) {
  const { id, memberId } = await params;
  const db = adminDb();
  if (!db) return <p>Not configured.</p>;
  const data = await loadCohort(db, id);
  const m = data?.managers.find((x) => x.member.id === memberId);
  if (!data || !m) notFound();
  const { data: asg } = await db.from("lab_assignments").select("session_n, done").eq("member_id", memberId);
  const assignments: Record<number, boolean> = {};
  for (const a of (asg ?? []) as { session_n: number; done: boolean }[]) assignments[a.session_n] = a.done;
  return (
    <div className="space-y-4">
      <Link href={`/analytics/lab/${id}`} className="text-xs text-slate-500 hover:text-slate-800">← {data.cohort.company_name}</Link>
      <h2 className="text-lg font-semibold">{m.member.full_name ?? m.member.email} <span className="text-sm font-normal text-slate-500">{[m.member.profile.designation, m.member.profile.city].filter(Boolean).join(" · ")}</span></h2>
      <MemberProgress m={m} data={data} assignments={assignments} />
    </div>
  );
}
