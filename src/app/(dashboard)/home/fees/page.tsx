import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { RANGES, inr, loadFees, parseRangeParam, rangeKey, shortDate } from "@/lib/anchor/data";
import { RANGE_LABEL } from "@/lib/anchor/intents";

export const dynamic = "force-dynamic";

const TAB: Record<string, string> = { "30": "30 days", "60": "60 days", "90": "90 days", life: "All time" };
const STATUS: Record<string, string> = { pending: "Not invoiced", proforma_sent: "Proforma sent", payment_received: "Paid", invoiced: "Invoiced", paid: "Paid" };

// Fees, admin only: what has been collected, what is still to come in, and per client. Amounts are as recorded, before GST.
export default async function FeesPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const sp = await searchParams;
  const range = parseRangeParam(sp.range);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/home");
  const admin = adminDb();
  if (!admin) redirect("/home");
  const f = await loadFees(admin, range);
  const open = f.rows.filter((r) => !r.paidAt);
  const paid = f.rows.filter((r) => r.paidAt);

  return (
    <div className="mx-auto max-w-[1000px] px-5 py-8">
      <h1 className="ros-page-title">Fees</h1>
      <p className="mt-1 text-[15px] text-slate-500 dark:text-slate-400">What has come in and what is still to collect. Amounts are before GST. Invoicing itself is in Analytics, Billing.</p>

      <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Period">
        {RANGES.map((r) => {
          const on = rangeKey(r) === rangeKey(range);
          return (
            <Link key={rangeKey(r)} href={`/home/fees?range=${rangeKey(r)}`} role="tab" aria-selected={on} className={`rounded-full border px-4 py-1.5 text-[14px] font-medium ${on ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-teal-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}>{TAB[rangeKey(r)]}</Link>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-ros-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-[13px] font-medium text-emerald-800 dark:text-emerald-300">Collected, {RANGE_LABEL[rangeKey(range)]}</p>
          <p className="mt-1 text-[30px] font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">{inr(f.collected)}</p>
          <p className="text-[13px] text-emerald-700 dark:text-emerald-300">{f.collectedCount} payment{f.collectedCount === 1 ? "" : "s"} received</p>
        </div>
        <div className="rounded-ros-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">Still to collect</p>
          <p className="mt-1 text-[30px] font-semibold tabular-nums text-amber-900 dark:text-amber-100">{inr(f.outstanding)}</p>
          <p className="text-[13px] text-amber-700 dark:text-amber-300">{f.outstandingCount} fee{f.outstandingCount === 1 ? "" : "s"}{f.overdueCount ? `, ${f.overdueCount} past the due date` : ", none overdue"}</p>
        </div>
      </div>
      {f.estimatedCount > 0 && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          {f.estimatedCount} fee{f.estimatedCount === 1 ? " is" : "s are"} an estimate: not invoiced yet, so the amount is worked out from the fee in lakhs. It becomes exact when the invoice is raised.
        </p>
      )}

      {f.byClient.length > 0 && (
        <section className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <header className="px-4 pb-2 pt-4"><h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">By client</h2></header>
          <ul>
            {f.byClient.map((c) => (
              <li key={c.client} className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-[14px] dark:border-slate-800">
                <span className="truncate font-medium text-slate-900 dark:text-slate-100">{c.client}</span>
                <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-300">{c.collected ? `${inr(c.collected)} collected` : ""}{c.collected && c.outstanding ? " · " : ""}{c.outstanding ? `${inr(c.outstanding)} due` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {[{ title: "Still to collect", rows: open }, { title: `Collected, ${RANGE_LABEL[rangeKey(range)]}`, rows: paid.filter((r) => r.paidInRange) }].map((g) =>
        g.rows.length === 0 ? null : (
          <section key={g.title} className="mt-5 overflow-hidden rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <header className="px-4 pb-2 pt-4"><h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{g.title}</h2></header>
            <ul>
              {g.rows.map((r) => (
                <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-slate-900 dark:text-slate-100">{r.client}</p>
                    <p className="truncate text-[13px] text-slate-500">{r.candidate} · {r.role}</p>
                    <p className="text-[12px] text-slate-400">{STATUS[r.status] ?? r.status}{r.paidAt ? ` · paid ${shortDate(r.paidAt)}` : r.due ? ` · due ${shortDate(r.due)}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{inr(r.amount)}</p>
                    {r.estimated ? <p className="text-[12px] font-medium text-amber-700 dark:text-amber-300">estimate</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
