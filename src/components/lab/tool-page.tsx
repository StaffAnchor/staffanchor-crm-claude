import Link from "next/link";
import { redirect } from "next/navigation";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember, type LabCohort, type LabMember } from "@/lib/lab/auth";
import PortalHeader from "@/app/lab/portal-header";
import type { SupabaseClient } from "@supabase/supabase-js";

// The frame every manager tool page shares: sign-in check, the database, the header, a back link and the title.
export async function toolContext(): Promise<{ me: { member: LabMember; cohort: LabCohort }; db: SupabaseClient }> {
  const me = await currentLabMember();
  if (!me) redirect("/lab");
  if (me.member.role !== "manager") redirect("/lab/home");
  const db = adminDb();
  if (!db) redirect("/lab/home");
  return { me, db };
}

export function ToolFrame({ me, eyebrow, title, intro, wide, children }: { me: { member: LabMember; cohort: LabCohort }; eyebrow: string; title: string; intro: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <>
      <PortalHeader company={me.cohort.company_name} cohort={me.cohort.name} who={me.member.full_name ?? me.member.email} role="Manager" />
      <main className={`mx-auto space-y-5 px-4 py-6 ${wide ? "max-w-5xl" : "max-w-4xl"}`}>
        <Link href="/lab/home" className="text-sm text-slate-500 hover:text-slate-800">← My progress</Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">{eyebrow}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{intro}</p>
        </div>
        {children}
      </main>
    </>
  );
}
export const fieldCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-900";
export const cardCls = "rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900";
