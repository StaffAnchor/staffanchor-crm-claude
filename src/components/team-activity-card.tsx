import Link from "next/link";
import { PhoneCall } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = { id: string; candidate_id: string; full_name: string | null; phone: string | null; outcome: string; call_back_at: string | null; created_at: string; caller_id: string | null; caller_name: string | null; has_pay: boolean; has_cv: boolean; tries: number };

// Midnight today in India, as an ISO time, so "today" means the team's day.
function istDayStartIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3_600_000).toISOString();
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ${m % 60} min ago`;
};
const OUT: Record<string, { label: string; cls: string }> = {
  reached: { label: "Spoke", cls: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100" },
  no_answer: { label: "Did not pick up", cls: "bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100" },
  call_later: { label: "Call back", cls: "bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100" },
  not_interested: { label: "Not interested", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  wrong_number: { label: "Wrong number", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

// Everyone's calls today, one line per person, with the calls behind each line. Read on load: reload the page for newer calls
// (the completions card on Profile completion refreshes by itself).
export default async function TeamActivityCard({ supabase }: { supabase: SupabaseClient }) {
  const { data } = await supabase.rpc("call_history_today", { p_since: istDayStartIso() });
  const rows = (data ?? []) as Row[];
  const people = new Map<string, { name: string; calls: Row[] }>();
  for (const r of rows) {
    const key = r.caller_id ?? "none";
    const p = people.get(key) ?? { name: r.caller_name?.trim() || "Unknown", calls: [] };
    p.calls.push(r);
    people.set(key, p);
  }
  const list = Array.from(people.values()).sort((a, b) => b.calls.length - a.calls.length);
  const n = (calls: Row[], o: string) => calls.filter((c) => c.outcome === o).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100"><PhoneCall className="h-4 w-4 text-slate-500" /> Team activity today</h2>
        <p className="text-[11.5px] text-slate-400">{rows.length} {rows.length === 1 ? "call" : "calls"} so far · {rows.filter((r) => r.outcome === "reached").length} reached</p>
      </div>
      {list.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-slate-400">Nobody has logged a call yet today.</p>
      ) : (
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((p) => (
            <details key={p.name} className="group py-2">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                <span className="min-w-[140px] font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                <span className="tabular-nums text-slate-700 dark:text-slate-200"><b>{p.calls.length}</b> calls</span>
                <span className="text-emerald-700 dark:text-emerald-300">{n(p.calls, "reached")} spoke</span>
                <span className="text-rose-700 dark:text-rose-300">{n(p.calls, "no_answer")} did not pick up</span>
                <span className="text-violet-700 dark:text-violet-300">{n(p.calls, "call_later")} call back</span>
                <span className="text-slate-500">{n(p.calls, "not_interested") + n(p.calls, "wrong_number")} closed</span>
                <span className="ml-auto text-[11.5px] text-slate-400">last call {ago(p.calls[0].created_at)}</span>
              </summary>
              <ul className="mt-2 space-y-1 pl-2">
                {p.calls.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="w-16 tabular-nums text-slate-400">{timeOf(c.created_at)}</span>
                    <Link href={`/candidates/${c.candidate_id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 hover:underline dark:text-teal-300">{c.full_name ?? "Unnamed"}</Link>
                    <span className={`rounded px-1.5 py-px text-[11px] font-medium ${OUT[c.outcome]?.cls ?? OUT.not_interested.cls}`}>{OUT[c.outcome]?.label ?? c.outcome}</span>
                    {c.outcome === "reached" && (!c.has_pay || !c.has_cv) && <span className="text-[11.5px] text-amber-700 dark:text-amber-300">still missing {[!c.has_pay && "current pay", !c.has_cv && "CV"].filter(Boolean).join(" and ")}</span>}
                    {c.outcome === "call_later" && c.call_back_at && <span className="text-[11.5px] text-slate-500">asked for {new Date(c.call_back_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
