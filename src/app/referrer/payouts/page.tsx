import { createClient } from "@/lib/supabase/server";

export default async function ReferrerPayoutsPage() {
  const supabase = await createClient();
  const { data: payouts } = await supabase
    .from("sales_circle_referral_payouts")
    .select("id, status, computed_payout_amount, slab_amount, paid_date, tds_amount, net_amount, sales_circle_referrals(candidate_name)")
    .order("created_at", { ascending: false });

  const rows = payouts ?? [];
  const sum = (status: string) =>
    rows.filter((p) => p.status === status).reduce((acc, p) => acc + (p.computed_payout_amount ?? p.slab_amount ?? 0), 0);
  const totalPending = sum("pending");
  const totalEligible = sum("eligible");
  const totalPaid = rows.filter((p) => p.status === "paid").reduce((acc, p) => acc + (p.net_amount ?? p.computed_payout_amount ?? 0), 0);

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Payouts</h1>
      <p className="text-sm text-slate-500 mt-1">Your Sales Circle earnings.</p>

      <div className="grid grid-cols-3 gap-3 mt-6">
        <SummaryCard label="Pending" value={totalPending} tone="text-slate-700" />
        <SummaryCard label="Eligible" value={totalEligible} tone="text-amber-600" />
        <SummaryCard label="Paid" value={totalPaid} tone="text-emerald-600" />
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 mt-8">No payouts yet -- they show up here once a referral is placed.</p>
      ) : (
        <div className="mt-6 divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
          {rows.map((p) => {
            const referral = Array.isArray(p.sales_circle_referrals) ? p.sales_circle_referrals[0] : p.sales_circle_referrals;
            const amount = p.status === "paid" ? p.net_amount ?? p.computed_payout_amount : p.computed_payout_amount ?? p.slab_amount;
            return (
              <div key={p.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div>
                  <div className="text-[14px] font-medium text-slate-900">{referral?.candidate_name ?? "—"}</div>
                  <div className="text-[12px] text-slate-400 mt-0.5">
                    {p.status === "paid" && p.paid_date ? `Paid ${p.paid_date}` : p.status === "eligible" ? "Eligible for payout" : "Pending"}
                  </div>
                </div>
                <div className="text-[14px] font-semibold text-slate-900">
                  {amount != null ? `₹${amount.toLocaleString("en-IN")}` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${tone}`}>₹{value.toLocaleString("en-IN")}</div>
    </div>
  );
}
