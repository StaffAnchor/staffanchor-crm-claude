import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadTodayDesk, type Decision } from "@/lib/today-desk";

export const dynamic = "force-dynamic";

const GROUPS: { tone: Decision["tone"]; title: string; blurb: string; dot: string }[] = [
  { tone: "urgent", title: "Urgent", blurb: "Do these today.", dot: "bg-rose-500" },
  { tone: "attention", title: "Needs attention", blurb: "Do these this week.", dot: "bg-amber-500" },
  { tone: "info", title: "Good to know", blurb: "No rush.", dot: "bg-slate-400" },
];

// One item per role, most important first, each with the button that does it.
export default async function DecisionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const desk = await loadTodayDesk(supabase, user.id, profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : null));

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="ros-page-title">Needs a decision</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
        {desk.decisions.length === 0 ? "Every role is set up and moving." : `${desk.decisions.length + desk.moreDecisions} roles need something from you. Each row has the one thing to do.`}
      </p>
      {desk.decisions.length === 0 && <p className="mt-6 flex items-center gap-2 rounded-ros-xl border border-slate-200 bg-white px-4 py-6 text-[15px] text-slate-600 dark:border-slate-800 dark:bg-slate-900"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> Nothing to decide right now.</p>}
      {GROUPS.map((g) => {
        const rows = desk.decisions.filter((d) => d.tone === g.tone);
        if (!rows.length) return null;
        return (
          <section key={g.tone} className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <header className="px-4 pb-2 pt-4"><h2 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900 dark:text-slate-100"><span className={`h-2 w-2 rounded-full ${g.dot}`} />{g.title} <span className="text-slate-400">{rows.length}</span></h2><p className="text-[13px] text-slate-500">{g.blurb}</p></header>
            <ul>
              {rows.map((d) => (
                <li key={d.id} className="flex flex-col gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 dark:border-slate-800">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{d.title}</p>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">{d.detail}</p>
                  </div>
                  <a href={d.href} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-teal-600 px-3 py-1.5 text-[14px] font-semibold text-white hover:bg-teal-700 sm:self-auto">{d.actionLabel}<ArrowRight className="h-3.5 w-3.5" aria-hidden /></a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {desk.moreDecisions > 0 && (
        <p className="mt-4 text-[14px] text-slate-500">{desk.moreDecisions} more {desk.moreDecisions === 1 ? "role needs" : "roles need"} attention. See them on <a href="/home/roles" target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 dark:text-teal-300">Roles</a>.</p>
      )}
    </div>
  );
}
