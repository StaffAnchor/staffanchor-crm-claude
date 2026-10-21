import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../portal-header";
import { StartOrJoin } from "./pair-forms";

export const dynamic = "force-dynamic";

export default async function CalibrationPage() {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data: cals } = await db.from("lab_calibrations").select("id, code, call_ref, a_member, b_member, created_at").or(`a_member.eq.${me.member.id},b_member.eq.${me.member.id}`).order("created_at", { ascending: false });
  const list = (cals ?? []) as { id: string; code: string; call_ref: string | null; a_member: string; b_member: string | null; created_at: string }[];
  const { data: scores } = list.length ? await db.from("lab_calibration_scores").select("calibration_id, member_id").in("calibration_id", list.map((c) => c.id)) : { data: [] };
  const done = (cid: string) => ((scores ?? []) as { calibration_id: string; member_id: string }[]).filter((s) => s.calibration_id === cid).map((s) => s.member_id);
  const status = (c: (typeof list)[number]) => {
    if (!c.b_member) return "Waiting for your partner to join";
    const d = done(c.id);
    const bothDone = d.includes(c.a_member) && d.includes(c.b_member);
    if (bothDone) return "Both scored: compare";
    return d.includes(me.member.id) ? "Waiting for your partner's scores" : "Your scores are due";
  };
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Session 4</p>
          <h1 className="text-2xl font-semibold tracking-tight">Calibration</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Two managers score the same call, then compare. A gap of 2 or more means you disagree on the standard, so talk it through before you score more calls. Use the call ID only: no names, recordings or transcripts.</p>
        </div>
        <StartOrJoin />
        {list.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold">Your calibrations</h2>
            <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
              {list.map((c) => (
                <li key={c.id}>
                  <Link href={`/lab/tools/calibration/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <span className="font-medium">Call {c.call_ref || "(no ID)"} <span className="ml-2 font-mono text-xs text-slate-400">{c.code}</span></span>
                    <span className="text-xs text-slate-500">{status(c)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
