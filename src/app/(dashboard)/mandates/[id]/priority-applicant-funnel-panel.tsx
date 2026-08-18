import { createClient } from "@/lib/supabase/server";
import { Zap, Wallet, UserX } from "lucide-react";

// Per-mandate slice of the same Priority Applicant funnel shown firm-wide on
// Reports -- see reports/page.tsx's "Priority Applicant" tab for the full
// explanation of each stage. This mirrors QuickApplyFunnelPanel's structure
// (rendered right next to it on the Sharing & Public Listing tab) but for the
// paid upsell instead of the free apply flow: CTA clicked -> checkout page
// landed -> Razorpay order started -> paid, plus abandoned orders and
// revenue scoped to just this mandate.
export default async function PriorityApplicantFunnelPanel({ mandateId }: { mandateId: string }) {
  const supabase = await createClient();

  const { data: clickRows } = await supabase
    .from("priority_applicant_clicks")
    .select("event_type")
    .eq("mandate_id", mandateId);

  // !inner turns this into a join, which is what lets the .eq() below
  // actually filter on the embedded table's column server-side (a plain
  // left-embed dot-filter is silently ignored by PostgREST).
  const { data: purchaseRows } = await supabase
    .from("priority_purchases")
    .select("id, status, amount_paise, created_at, applied_to_link_id, candidate_mandate_links!applied_to_link_id!inner(mandate_id)")
    .eq("candidate_mandate_links.mandate_id", mandateId);

  const clicks = clickRows ?? [];
  const ctaClicks = clicks.filter((e) => e.event_type === "click").length;
  const checkoutLanded = clicks.filter((e) => e.event_type === "checkout_started").length;

  // applied_to_link_id ties a purchase back to a specific application --
  // only purchases made from THIS mandate's apply/confirmation flow count
  // here (a candidate who bought credits from another mandate's page and
  // later spent one here wouldn't show as a purchase on this mandate). The
  // !inner join above already restricts to this mandate's links.
  const purchases = purchaseRows ?? [];
  const paid = purchases.filter((p) => p.status === "paid");
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const abandoned = purchases.filter((p) => p.status === "created" && new Date(p.created_at) < oneHourAgo);
  const revenue = paid.reduce((sum, p) => sum + (p.amount_paise ?? 0), 0) / 100;

  const clickToLandedPct = ctaClicks > 0 ? Math.round((checkoutLanded / ctaClicks) * 100) : null;
  const landedToAttemptPct = checkoutLanded > 0 ? Math.round((purchases.length / checkoutLanded) * 100) : null;
  const attemptToPaidPct = purchases.length > 0 ? Math.round((paid.length / purchases.length) * 100) : null;

  if (ctaClicks === 0 && purchases.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm mt-4">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-3">
        <Zap className="w-3.5 h-3.5 text-indigo-500" /> Priority Applicant funnel
      </h2>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{ctaClicks}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">CTA clicked</p>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 py-3">
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{checkoutLanded}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Checkout landed{clickToLandedPct !== null ? ` · ${clickToLandedPct}%` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 py-3">
          <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{purchases.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Order started{landedToAttemptPct !== null ? ` · ${landedToAttemptPct}%` : ""}
          </p>
        </div>
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/40 py-3">
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">{paid.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            Paid{attemptToPaidPct !== null ? ` · ${attemptToPaidPct}%` : ""}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[12px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Wallet className="w-3.5 h-3.5 text-slate-400" /> ₹{revenue.toLocaleString("en-IN")} revenue
        </span>
        <span className="flex items-center gap-1">
          <UserX className="w-3.5 h-3.5 text-amber-500" /> {abandoned.length} tried but changed mind
        </span>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        Full firm-wide breakdown (by placement, location, device) is on Reports → Priority Applicant.
      </p>
    </div>
  );
}
