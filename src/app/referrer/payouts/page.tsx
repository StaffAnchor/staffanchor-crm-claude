import Link from "next/link";
import { BadgeCheck, Clock3, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { inr } from "@/lib/sales-circle";

type PayoutRow = {
  id: string;
  status: string;
  computed_payout_amount: number | null;
  slab_amount: number | null;
  paid_date: string | null;
  eligibility_date: string | null;
  tds_amount: number | null;
  net_amount: number | null;
  sales_circle_referrals: { candidate_name: string; mandate_id: string | null } | { candidate_name: string; mandate_id: string | null }[] | null;
};

const STATUS_COPY: Record<string, { label: string; pill: string; note: string }> = {
  pending: { label: "On its way", pill: "bg-slate-100 text-slate-600", note: "Your candidate has joined. The payout is released after the 90 days and the client's payment." },
  eligible: { label: "Ready to pay", pill: "bg-amber-50 text-amber-700", note: "Approved. We're processing this payout." },
  paid: { label: "Paid", pill: "bg-emerald-50 text-emerald-700", note: "" },
};

export default async function ReferrerPayoutsPage() {
  const supabase = await createClient();
  const { data: payouts } = await supabase
    .from("sales_circle_referral_payouts")
    .select("id, status, computed_payout_amount, slab_amount, paid_date, eligibility_date, tds_amount, net_amount, sales_circle_referrals(candidate_name, mandate_id)")
    .order("created_at", { ascending: false });
  const { data: roleTitles } = await supabase.rpc("referrer_role_titles");
  const titleById = new Map(((roleTitles ?? []) as { id: string; role_title: string }[]).map((r) => [r.id, r.role_title]));

  const rows = (payouts ?? []) as unknown as PayoutRow[];
  const gross = (p: PayoutRow) => p.computed_payout_amount ?? p.slab_amount ?? 0;
  const sum = (status: string) => rows.filter((p) => p.status === status).reduce((acc, p) => acc + gross(p), 0);
  const totalPaid = rows.filter((p) => p.status === "paid").reduce((acc, p) => acc + (p.net_amount ?? p.computed_payout_amount ?? 0), 0);

  const tiles = [
    { label: "Paid to you", value: totalPaid, icon: BadgeCheck, tone: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Ready to pay", value: sum("eligible"), icon: Wallet, tone: "text-amber-600", bg: "bg-amber-50" },
    { label: "On its way", value: sum("pending"), icon: Clock3, tone: "text-slate-600", bg: "bg-slate-100" },
  ];

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">Payouts</h1>
      <p className="mt-1 text-[14px] text-slate-500">Your Sales Circle earnings, and where each payout stands.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${t.bg} ${t.tone}`}>
                <t.icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.label}</span>
            </div>
            <div className={`mt-2 text-[26px] font-bold leading-none ${t.tone}`}>{inr(t.value)}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-slate-700">No payouts yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-slate-400">A payout appears here the moment someone you referred joins. Each open role shows what you&apos;d earn.</p>
          <Link href="/referrer/roles" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-700">
            See open roles
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((p) => {
            const referral = Array.isArray(p.sales_circle_referrals) ? p.sales_circle_referrals[0] : p.sales_circle_referrals;
            const role = referral?.mandate_id ? titleById.get(referral.mandate_id) : null;
            const copy = STATUS_COPY[p.status] ?? STATUS_COPY.pending;
            const paid = p.status === "paid";
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-slate-100 px-5 py-4 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-slate-900">{referral?.candidate_name ?? "—"}</div>
                  <div className="mt-0.5 text-[12.5px] text-slate-500">
                    {role ? `${role} · ` : ""}
                    {paid && p.paid_date ? `Paid on ${new Date(p.paid_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}` : copy.note}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${copy.pill}`}>{copy.label}</span>
                  <div className="text-right">
                    <div className="text-[15px] font-bold text-slate-900">{inr(paid ? p.net_amount ?? p.computed_payout_amount : gross(p) || null)}</div>
                    {paid && p.tds_amount != null && (
                      <div className="text-[11px] text-slate-400">
                        {inr(p.computed_payout_amount)} less {inr(p.tds_amount)} TDS
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
