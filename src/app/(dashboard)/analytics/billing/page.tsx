import { createClient } from "@/lib/supabase/server";
import BillingView, { type TrancheRow } from "./billing-view";
import BillingTabs from "./billing-tabs";

// Fee-tranche billing ops view -- placement_fee_tranches rows are generated
// automatically (fn_create_fee_tranches(), see migration) the moment a
// candidate is marked placed, using the mandate's fee_tranche_template
// (fee-schedule-panel.tsx) and the client's fee_percentage. Lifecycle is
// Placement -> Joining -> Proforma Invoice -> Payment -> Final Invoice
// (this firm requires a proforma before most clients release payment, tax
// invoice cut only once payment lands) -- tracked via
// pending/proforma_sent/payment_received/final_invoiced/cancelled. Totals
// and per-row amounts are computed GST-inclusive in BillingView so this
// page always matches the "Final Billing Value" shown on Placements.
export default async function BillingPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("placement_fee_tranches")
    .select(
      "id, label, split_pct, amount_lakhs, due_date, status, proforma_sent_at, payment_received_at, final_invoiced_at, proforma_invoice_number, final_invoice_number, mandates(role_title, client_name, client_id), candidate_mandate_links(candidates(full_name))"
    )
    // Cancelled tranches are placements that fell through after the tranche
    // was generated (did_not_join / stage moved off placed, see
    // fn_create_fee_tranches) -- kept in the table for audit history but
    // never meant to appear as a real billing obligation here.
    .neq("status", "cancelled")
    .order("due_date", { ascending: true });

  const rows: TrancheRow[] = (error ? [] : data ?? []).map((r) => {
    const mandate = r.mandates as unknown as { role_title: string; client_name: string; client_id: string | null } | null;
    const link = r.candidate_mandate_links as unknown as { candidates: { full_name: string } | null } | null;
    return {
      id: r.id,
      label: r.label,
      split_pct: r.split_pct,
      amount_lakhs: r.amount_lakhs,
      due_date: r.due_date,
      status: r.status,
      proforma_sent_at: r.proforma_sent_at,
      payment_received_at: r.payment_received_at,
      final_invoiced_at: r.final_invoiced_at,
      proforma_invoice_number: r.proforma_invoice_number,
      final_invoice_number: r.final_invoice_number,
      role_title: mandate?.role_title ?? "—",
      client_name: mandate?.client_name ?? "—",
      has_client_link: Boolean(mandate?.client_id),
      candidate_name: link?.candidates?.full_name ?? "—",
    };
  });

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Billing</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        Fee tranches generated automatically at placement, split per each mandate&apos;s fee schedule.
      </p>
      <BillingTabs liveTranches={<BillingView initialRows={rows} fetchError={error?.message ?? null} />} />
    </div>
  );
}
