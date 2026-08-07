import { createClient } from "@/lib/supabase/server";
import BillingView, { type TrancheRow } from "./billing-view";

// Fee-tranche billing ops view -- placement_fee_tranches rows are generated
// automatically (fn_create_fee_tranches(), see migration) the moment a
// candidate is marked placed, using the mandate's fee_tranche_template
// (fee-schedule-panel.tsx) and the client's fee_percentage. This is where
// that gets tracked through to actually getting invoiced and paid --
// previously there was nowhere for "we billed the placement tranche, still
// waiting on the 90-day one" to live at all.
export default async function BillingPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("placement_fee_tranches")
    .select(
      "id, label, split_pct, amount_lakhs, due_date, status, invoiced_at, paid_at, mandates(role_title, client_name), candidate_mandate_links(candidates(full_name))"
    )
    .order("due_date", { ascending: true });

  const rows: TrancheRow[] = (error ? [] : data ?? []).map((r) => {
    const mandate = r.mandates as unknown as { role_title: string; client_name: string } | null;
    const link = r.candidate_mandate_links as unknown as { candidates: { full_name: string } | null } | null;
    return {
      id: r.id,
      label: r.label,
      split_pct: r.split_pct,
      amount_lakhs: r.amount_lakhs,
      due_date: r.due_date,
      status: r.status,
      invoiced_at: r.invoiced_at,
      paid_at: r.paid_at,
      role_title: mandate?.role_title ?? "—",
      client_name: mandate?.client_name ?? "—",
      candidate_name: link?.candidates?.full_name ?? "—",
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      const amt = r.amount_lakhs ?? 0;
      acc.total += amt;
      if (r.status === "pending") acc.pending += amt;
      if (r.status === "invoiced") acc.invoiced += amt;
      if (r.status === "paid") acc.paid += amt;
      return acc;
    },
    { total: 0, pending: 0, invoiced: 0, paid: 0 }
  );

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-1">Billing</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
        Fee tranches generated automatically at placement, split per each mandate&apos;s fee schedule.
      </p>
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total", value: totals.total },
          { label: "Pending", value: totals.pending },
          { label: "Invoiced", value: totals.invoiced },
          { label: "Paid", value: totals.paid },
        ].map((t) => (
          <div key={t.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{t.label}</p>
            <p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">₹{t.value.toLocaleString("en-IN")}L</p>
          </div>
        ))}
      </div>
      <BillingView initialRows={rows} fetchError={error?.message ?? null} />
    </div>
  );
}
