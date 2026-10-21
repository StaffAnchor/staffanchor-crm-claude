import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember } from "@/lib/lab/auth";
import PortalHeader from "../../../portal-header";
import { Compare, ScoreForm } from "../pair-forms";

export const dynamic = "force-dynamic";

export default async function CalibrationDetail({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const { id } = await params;
  const db = adminDb();
  if (!db) return <p className="p-8">Not available right now.</p>;
  const { data: cal } = await db.from("lab_calibrations").select("id, code, call_ref, a_member, b_member, standards").eq("id", id).maybeSingle();
  if (!cal || (cal.a_member !== me.member.id && cal.b_member !== me.member.id)) notFound();
  const { data: scores } = await db.from("lab_calibration_scores").select("member_id, ratings").eq("calibration_id", id);
  const rows = (scores ?? []) as { member_id: string; ratings: Record<string, number> }[];
  const partnerId = cal.a_member === me.member.id ? cal.b_member : cal.a_member;
  const mine = rows.find((r) => r.member_id === me.member.id)?.ratings ?? null;
  const theirs = partnerId ? rows.find((r) => r.member_id === partnerId)?.ratings ?? null : null;
  // The partner's first name is shown only once the two of you are paired on this call.
  const { data: p } = partnerId ? await db.from("lab_members").select("full_name").eq("id", partnerId).maybeSingle() : { data: null };
  const partner = (p?.full_name ?? "").split(/\s+/)[0] || "Your partner";
  const both = !!mine && !!theirs;

  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
        <Link href="/lab/tools/calibration" className="text-sm text-slate-500 hover:text-slate-800">← Calibration</Link>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Call {cal.call_ref || "(no ID)"}</h1>
          {!cal.b_member ? (
            <p className="mt-2 rounded-xl bg-teal-50 p-4 text-sm text-teal-900 ring-1 ring-teal-200">Share this code with the manager you are calibrating with: <b className="ml-1 font-mono text-lg tracking-widest">{cal.code}</b>. They sign in, choose Calibration, and join with it.</p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Paired with {partner}. {both ? "You have both scored this call." : mine ? `Waiting for ${partner}'s scores.` : "Score the call below."}</p>
          )}
        </div>
        {cal.b_member && <ScoreForm id={id} initial={mine} locked={both} />}
        {both && <Compare id={id} mine={mine!} theirs={theirs!} partner={partner} standards={(cal.standards ?? {}) as Record<string, string>} />}
      </main>
    </>
  );
}
