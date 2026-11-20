import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { KIND_LABEL, loadWaiting, type WaitingItem, type WaitingKind } from "@/lib/waiting-queue";

export const dynamic = "force-dynamic";

const ORDER: WaitingKind[] = ["employer", "candidate_on_role", "question", "overdue"];
const BLURB: Record<WaitingKind, string> = {
  employer: "Employers who wrote in. Answer these first.",
  candidate_on_role: "Candidates who wrote while they are on a live role.",
  question: "Questions the WhatsApp assistant could not answer.",
  overdue: "Wrote in over a day ago and no person has replied yet.",
};
// How long before each kind counts as late.
const LATE_HOURS: Record<WaitingKind, number> = { employer: 4, candidate_on_role: 24, question: 48, overdue: 72 };
const age = (h: number) => (h >= 48 ? `${Math.floor(h / 24)} days` : h >= 24 ? "1 day" : `${h}h`);

function Row({ w }: { w: WaitingItem }) {
  const late = w.hoursWaiting >= LATE_HOURS[w.kind];
  return (
    <li className="border-t border-slate-100 first:border-t-0 dark:border-slate-800">
      <a href={w.href} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ros-focusable">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">{w.name}</p>
          {w.preview ? <p className="truncate text-[13px] text-slate-500 dark:text-slate-400">{w.preview}</p> : null}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${late ? "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{age(w.hoursWaiting)}</span>
        <span className="hidden shrink-0 items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-[13px] font-semibold text-white sm:inline-flex">Reply <ArrowRight className="h-3.5 w-3.5" aria-hidden /></span>
      </a>
    </li>
  );
}

// Everyone waiting on a reply, in the order it costs us to leave them: employers, candidates on a live role, then the rest.
export default async function RepliesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const admin = adminDb();
  const waiting = admin ? await loadWaiting(admin).catch(() => [] as WaitingItem[]) : [];
  const by = (k: WaitingKind) => waiting.filter((w) => w.kind === k).sort((a, b) => b.hoursWaiting - a.hoursWaiting);
  const late = waiting.filter((w) => w.hoursWaiting >= LATE_HOURS[w.kind]).length;
  const first = ORDER.map(by).find((g) => g.length)?.[0];

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="ros-page-title">Reply to people</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">
        {waiting.length === 0 ? "Nobody is waiting on you." : `${waiting.length} waiting${late ? `, ${late} already late` : ""}. ${first ? `Start with ${first.name}: ${KIND_LABEL[first.kind].toLowerCase()}, waiting ${age(first.hoursWaiting)}.` : ""}`}
      </p>

      {waiting.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ORDER.map((k) => (
            <div key={k} className="rounded-ros-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-[24px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{by(k).length}</p>
              <p className="text-[13px] text-slate-500">{k === "employer" ? "Employers" : k === "candidate_on_role" ? "On a live role" : k === "question" ? "Unanswered questions" : "Over a day old"}</p>
            </div>
          ))}
        </div>
      )}

      {waiting.length === 0 ? (
        <p className="mt-6 flex items-center gap-2 rounded-ros-xl border border-slate-200 bg-white px-4 py-6 text-[15px] text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"><CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden /> Everyone has an answer.</p>
      ) : (
        ORDER.map((k) =>
          by(k).length === 0 ? null : (
            <section key={k} className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <header className="px-4 pb-2 pt-4">
                <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{k === "employer" ? "Employers" : k === "candidate_on_role" ? "Candidates on a live role" : k === "question" ? "Questions for a person" : "Waiting over a day"} <span className="text-slate-400">{by(k).length}</span></h2>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">{BLURB[k]} Longest wait first.</p>
              </header>
              <ul>{by(k).map((w) => <Row key={`${w.kind}-${w.key}`} w={w} />)}</ul>
            </section>
          ),
        )
      )}
    </div>
  );
}
