import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadTodayDesk, type RoleHealth, type RoleRow } from "@/lib/today-desk";

export const dynamic = "force-dynamic";

const GROUPS: { key: RoleHealth; title: string; blurb: string; cls: string }[] = [
  { key: "behind", title: "Behind", blurb: "Nothing has gone to the client for a week or more.", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  { key: "slow", title: "Slow", blurb: "Nothing in the pipeline has moved for a week.", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  { key: "ontrack", title: "On track", blurb: "Moving as it should.", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
];

function Line({ r }: { r: RoleRow }) {
  return (
    <li className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
      <a href={`/mandates/${r.mandateId}`} target="_blank" rel="noopener noreferrer" className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ros-focusable">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-[15px] font-medium text-slate-900 dark:text-slate-100">{r.role}</p>
          <p className="text-[13px] text-slate-500">{r.client} · open {r.daysOpen}d</p>
        </div>
        <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
          {r.inPipeline} in pipeline · <span className={r.unreviewed >= 5 ? "font-medium text-amber-700 dark:text-amber-300" : ""}>{r.unreviewed} not opened</span> · {r.sent} sent to client · {r.interviewing} interviewing
        </p>
        <p className="mt-0.5 text-[13px] text-slate-500">{r.healthNote}{r.setupNote ? <span className="font-medium text-teal-700 dark:text-teal-300"> · {r.setupNote}</span> : null}</p>
      </a>
    </li>
  );
}

// Every open role, grouped by how it is doing, with what is holding it up.
export default async function RolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("full_name, email").eq("id", user.id).single();
  const desk = await loadTodayDesk(supabase, user.id, profile?.full_name ?? (profile?.email ? profile.email.split("@")[0] : null));
  const count = (h: RoleHealth) => desk.roles.filter((r) => r.health === h).length;
  const unopened = desk.roles.reduce((s, r) => s + r.unreviewed, 0);
  const sent = desk.roles.reduce((s, r) => s + r.sent, 0);
  const worst = desk.roles.find((r) => r.health === "behind");

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="ros-page-title">Roles at a glance</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
        {desk.roles.length === 0 ? "No open roles." : `${desk.roles.length} open roles: ${count("behind")} behind, ${count("slow")} slow, ${count("ontrack")} on track. ${unopened} applicants nobody has opened.${worst ? ` Longest stuck: ${worst.role} at ${worst.client}.` : ""}`}
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: desk.roles.length, l: "Open roles" },
          { v: count("behind"), l: "Behind" },
          { v: unopened, l: "Applicants not opened" },
          { v: sent, l: "Sent to clients" },
        ].map((t) => (
          <div key={t.l} className="rounded-ros-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[24px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{t.v}</p>
            <p className="text-[13px] text-slate-500">{t.l}</p>
          </div>
        ))}
      </div>
      {GROUPS.map((g) => {
        const rows = desk.roles.filter((r) => r.health === g.key);
        if (!rows.length) return null;
        return (
          <section key={g.key} className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <header className="px-4 pb-2 pt-4"><h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100"><span className={`mr-2 inline-flex rounded-full px-2.5 py-0.5 text-[13px] font-medium ${g.cls}`}>{g.title}</span>{rows.length}</h2><p className="mt-1 text-[13px] text-slate-500">{g.blurb}</p></header>
            <ul>{rows.map((r) => <Line key={r.mandateId} r={r} />)}</ul>
          </section>
        );
      })}
    </div>
  );
}
