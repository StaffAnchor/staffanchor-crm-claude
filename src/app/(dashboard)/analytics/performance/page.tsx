import { createClient } from "@/lib/supabase/server";
import PerformanceView, { type RevenueRow } from "./performance-view";

const GST_RATE = 0.18;

// Unifies the two revenue sources this firm has: historical_invoices (the
// 1.5-2 years of pre-CRM invoices, backfilled via the Historical Invoices
// importer -- net_amount/gross_amount already GST-split at parse time) and
// placement_fee_tranches (every placement since this CRM went live --
// amount_lakhs is GST-EXCLUSIVE, see billing-view.tsx's withGst(), so it's
// grossed up the same way here for an apples-to-apples number). Cancelled
// tranches (placement fell through) are excluded, same as Billing.
//
// Each row gets a single "as of" date used for month/FY bucketing: the most
// advanced milestone on file (final invoice > payment > proforma > due
// date) so a still-pending tranche still lands in the month it's *expected*
// to bill, and a completed one lands where it was actually invoiced.
export default async function PerformancePage() {
  const supabase = await createClient();

  const { data: historical } = await supabase
    .from("historical_invoices")
    .select("id, invoice_date, gross_amount, net_amount, clients(id, name)")
    .not("client_id", "is", null);

  const { data: tranches } = await supabase
    .from("placement_fee_tranches")
    .select(
      "id, amount_lakhs, due_date, status, proforma_sent_at, payment_received_at, final_invoiced_at, mandates(client_id, client_name)"
    )
    .neq("status", "cancelled");

  const rows: RevenueRow[] = [];

  for (const inv of historical ?? []) {
    const client = inv.clients as unknown as { id: string; name: string } | null;
    if (!client || !inv.invoice_date) continue;
    rows.push({
      source: "historical",
      clientId: client.id,
      clientName: client.name,
      date: inv.invoice_date,
      gross: Number(inv.gross_amount ?? 0),
      net: Number(inv.net_amount ?? 0),
      status: "final_invoiced",
    });
  }

  for (const t of tranches ?? []) {
    const mandate = t.mandates as unknown as { client_id: string | null; client_name: string } | null;
    if (!mandate?.client_id || t.amount_lakhs == null) continue;
    const date = t.final_invoiced_at ?? t.payment_received_at ?? t.proforma_sent_at ?? t.due_date;
    if (!date) continue;
    const net = Number(t.amount_lakhs);
    rows.push({
      source: "live",
      clientId: mandate.client_id,
      clientName: mandate.client_name,
      date,
      gross: Math.round(net * (1 + GST_RATE)),
      net,
      status: t.status,
    });
  }

  return (
    <div className="max-w-[1400px] mx-auto px-5 py-8">
      <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Performance</h1>
      <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
        Client-wise, month-wise, and FY-wise revenue -- combines pre-CRM historical invoices with every placement fee tranche since.
      </p>
      <PerformanceView rows={rows} />
    </div>
  );
}
