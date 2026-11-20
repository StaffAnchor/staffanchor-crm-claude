import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadClientReplies, type ClientReply } from "@/lib/client-replies";
import ClientReplies from "../../today/client-replies";

export const dynamic = "force-dynamic";

const reasonOf = (extra: string | null) => (extra ? extra.split(":")[0].trim().toLowerCase() : "no reason given");

// What employers did in the client portal over the last 30 days: who liked, who passed and why, and how each client behaves.
export default async function ClientRepliesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { items, unseen } = await loadClientReplies(supabase, { days: 30, limit: 300 }).catch(() => ({ items: [] as ClientReply[], unseen: 0 }));
  const acts = items.filter((i) => i.kind !== "login");
  const n = (k: ClientReply["kind"]) => items.filter((i) => i.kind === k).length;
  const liked = n("interested");
  const asked = n("interview_requested");
  const passed = n("not_interested");

  const clients = new Map<string, { client: string; liked: number; interviews: number; passed: number; logins: number; last: string }>();
  for (const r of items) {
    const key = r.clientId;
    const c = clients.get(key) ?? { client: r.client ?? "A client", liked: 0, interviews: 0, passed: 0, logins: 0, last: r.at };
    if (r.kind === "interested") c.liked++;
    if (r.kind === "interview_requested") c.interviews++;
    if (r.kind === "not_interested") c.passed++;
    if (r.kind === "login") c.logins++;
    if (r.at > c.last) c.last = r.at;
    clients.set(key, c);
  }
  const reasons = new Map<string, number>();
  for (const r of items.filter((i) => i.kind === "not_interested")) reasons.set(reasonOf(r.extra), (reasons.get(reasonOf(r.extra)) ?? 0) + 1);
  const topReasons = [...reasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const rate = liked + asked + passed > 0 ? Math.round(((liked + asked) / (liked + asked + passed)) * 100) : null;

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="ros-page-title">Client replies</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
        Last 30 days. {acts.length === 0 ? "No employer has reacted yet." : `${liked + asked} positive, ${passed} passes${rate !== null ? `, so clients said yes ${rate}% of the time` : ""}. ${unseen} new since you last looked.`}
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: liked, l: "Interested", c: "text-emerald-700" },
          { v: asked, l: "Asked to interview", c: "text-indigo-700" },
          { v: passed, l: "Passed", c: "text-rose-700" },
          { v: n("login"), l: "Portal sign-ins", c: "text-slate-600" },
        ].map((t) => (
          <div key={t.l} className="rounded-ros-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className={`text-[24px] font-semibold tabular-nums ${t.c} dark:text-slate-100`}>{t.v}</p>
            <p className="text-[13px] text-slate-500">{t.l}</p>
          </div>
        ))}
      </div>

      {clients.size > 0 && (
        <section className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="px-4 pb-2 pt-4"><h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">By client</h2><p className="text-[13px] text-slate-500">Who is engaged and who is going quiet.</p></header>
          <ul>
            {[...clients.values()].sort((a, b) => b.last.localeCompare(a.last)).map((c) => (
              <li key={c.client} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 text-[14px] dark:border-slate-800">
                <span className="font-medium text-slate-900 dark:text-slate-100">{c.client}</span>
                <span className="text-[13px] text-slate-500">{c.liked} interested · {c.interviews} interview · {c.passed} passed · {c.logins} sign-ins</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {topReasons.length > 0 && (
        <section className="mt-5 rounded-ros-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Why clients passed</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {topReasons.map(([r, c]) => <span key={r} className="rounded-full bg-rose-50 px-3 py-1 text-[13px] text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{r} · {c}</span>)}
          </div>
        </section>
      )}

      <div className="mt-5"><ClientReplies items={items} unseen={unseen} /></div>
    </div>
  );
}
