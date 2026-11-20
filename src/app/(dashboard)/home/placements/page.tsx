import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RANGES, loadPlaced, parseRangeParam, rangeKey, shortDate } from "@/lib/anchor/data";
import { RANGE_LABEL } from "@/lib/anchor/intents";

export const dynamic = "force-dynamic";

const TAB: Record<string, string> = { "30": "30 days", "60": "60 days", "90": "90 days", life: "All time" };
const CONFIRM: Record<string, string> = { joined: "Joined", not_joined: "Did not join", pending: "Joining date set" };

// Who was placed, with the client and the joining date, for the last 30, 60 or 90 days or ever.
export default async function PlacedPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const range = parseRangeParam(sp.range);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { rows, counts } = await loadPlaced(supabase, range);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="ros-page-title">Placements</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">Everyone placed, with the client and the day they joined. Newest first.</p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Period">
        {RANGES.map((r) => {
          const on = rangeKey(r) === rangeKey(range);
          return (
            <Link key={rangeKey(r)} href={`/home/placements?range=${rangeKey(r)}`} role="tab" aria-selected={on} className={`rounded-full border px-4 py-1.5 text-[14px] font-medium ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>
              {TAB[rangeKey(r)]} <span className={on ? "text-teal-100" : "text-slate-400"}>· {counts[rangeKey(r)] ?? 0}</span>
            </Link>
          );
        })}
      </div>

      <section className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <header className="px-4 pb-3 pt-4">
          <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{rows.length} placed, {RANGE_LABEL[rangeKey(range)]}</h2>
        </header>
        {rows.length === 0 ? (
          <p className="border-t border-slate-100 px-4 py-6 text-[15px] text-slate-500 dark:border-slate-800">Nobody joined in this period. Try a longer one.</p>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] gap-x-3 border-t border-slate-100 px-4 py-2 text-xs uppercase tracking-wide text-slate-400 sm:grid dark:border-slate-800">
              <span>Candidate</span><span>Client</span><span>Role</span><span>Date of joining</span>
            </div>
            <ul>
              {rows.map((p) => (
                <li key={p.linkId} className="grid grid-cols-1 gap-x-3 gap-y-0.5 border-t border-slate-100 px-4 py-3 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)] sm:items-center dark:border-slate-800">
                  <a href={`/candidates/${p.candidateId}`} target="_blank" rel="noopener noreferrer" className="truncate text-[15px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{p.candidate}</a>
                  <span className="truncate text-[14px] text-slate-700 dark:text-slate-300">{p.client}</span>
                  <a href={`/mandates/${p.mandateId}`} target="_blank" rel="noopener noreferrer" className="truncate text-[14px] text-slate-600 hover:text-teal-700 dark:text-slate-300">{p.role}</a>
                  <span className="text-[14px] tabular-nums text-slate-700 dark:text-slate-300">
                    {shortDate(p.joined)}
                    {p.joinStatus && CONFIRM[p.joinStatus] ? <span className="block text-[12px] text-slate-400">{CONFIRM[p.joinStatus]}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <p className="mt-3 text-[13px] text-slate-400">Fee tracking, retention check-ins and confirming a joining date are on the <a href="/placements" target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 dark:text-teal-300">Placements tracker</a>.</p>
    </div>
  );
}
