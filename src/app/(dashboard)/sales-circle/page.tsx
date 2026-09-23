import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ReferrerApplicationsPanel from "./referrer-applications-panel";
import ReferrersTable from "./referrers-table";
import ReferralsStatusControl from "./referrals-status-control";
import PayoutSlabsPanel from "./payout-slabs-panel";
import PayoutsPanel from "./payouts-panel";
import MandateVisibilityControl from "./mandate-visibility-control";

// Admin control room for the Sales Circle referral network -- external
// referrers (not vendors: passive one-time introducers, capped slab
// payouts, zero candidate-edit access -- see referrer-apply/page.tsx and
// the schema comment in the migration for why this is a separate persona
// from vendor_agencies). Same admin-only gate as /team and /vendors.
export default async function SalesCirclePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (myProfile?.role !== "admin") redirect("/candidates");

  const { data: pendingApplications } = await supabase
    .from("sales_circle_referrers")
    .select("id, full_name, email, phone, linkedin_url, current_company, designation, years_of_experience, sectors, city, created_at")
    .eq("status", "applied")
    .order("created_at", { ascending: false });

  const { data: referrers } = await supabase
    .from("sales_circle_referrers")
    .select("id, full_name, email, status, tier, current_company, created_at")
    .order("created_at", { ascending: false });

  const { data: referralsRaw } = await supabase
    .from("sales_circle_referrals")
    .select("id, candidate_name, status, created_at, referrer_id, mandate_id, sales_circle_referrers(full_name), mandates(role_title, client_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  const referrals = (referralsRaw ?? []).map((r) => {
    const referrer = Array.isArray(r.sales_circle_referrers) ? r.sales_circle_referrers[0] : r.sales_circle_referrers;
    const mandate = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
    return {
      id: r.id,
      candidate_name: r.candidate_name,
      status: r.status,
      created_at: r.created_at,
      referrer_name: referrer?.full_name ?? "—",
      role_title: mandate?.role_title ?? "Bench",
      client_name: mandate?.client_name ?? "—",
    };
  });

  const { data: slabs } = await supabase
    .from("sales_circle_payout_slabs")
    .select("id, ctc_band_min, ctc_band_max, payout_amount, active")
    .order("ctc_band_min", { ascending: true });

  const { data: payoutsRaw } = await supabase
    .from("sales_circle_referral_payouts")
    .select("id, slab_amount, fee_received_amount, computed_payout_amount, status, tds_amount, net_amount, referral_id, sales_circle_referrals(candidate_name)")
    .order("created_at", { ascending: false });

  const payouts = (payoutsRaw ?? []).map((p) => {
    const referral = Array.isArray(p.sales_circle_referrals) ? p.sales_circle_referrals[0] : p.sales_circle_referrals;
    return { ...p, candidate_name: referral?.candidate_name ?? "—" };
  });

  const { data: visibleMandates } = await supabase
    .from("mandates")
    .select("id, role_title, client_name, referral_visible, referral_reveal_company_to_trusted, is_archived")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8 space-y-8">
      <div>
        <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100 mb-1">Sales Circle</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          External referrer network -- pending applications, active referrers, referral pipeline, payout slabs and
          payout ledger.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Pending applications</h2>
        <ReferrerApplicationsPanel applications={pendingApplications ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Referrers</h2>
        <ReferrersTable referrers={referrers ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Roles visible on referrer board</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Toggle which open mandates referrers can see and refer against, and whether Trusted-tier referrers see the
          client company name.
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-3 py-2">Role</th>
                <th className="text-left font-medium px-3 py-2">Client</th>
                <th className="text-left font-medium px-3 py-2">Visibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(visibleMandates ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{m.role_title}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{m.client_name}</td>
                  <td className="px-3 py-2">
                    <MandateVisibilityControl
                      mandateId={m.id}
                      referralVisible={m.referral_visible}
                      revealCompany={m.referral_reveal_company_to_trusted}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Referrals</h2>
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="text-left font-medium px-3 py-2">Candidate</th>
                <th className="text-left font-medium px-3 py-2">Referrer</th>
                <th className="text-left font-medium px-3 py-2">Role</th>
                <th className="text-left font-medium px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {referrals.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{r.candidate_name}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.referrer_name}</td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                    {r.role_title}
                    <div className="text-[11px] text-slate-400">{r.client_name}</div>
                  </td>
                  <td className="px-3 py-2">
                    <ReferralsStatusControl referralId={r.id} currentStatus={r.status} />
                  </td>
                </tr>
              ))}
              {referrals.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                    No referrals yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Payout slabs</h2>
        <PayoutSlabsPanel slabs={slabs ?? []} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Payouts</h2>
        <PayoutsPanel payouts={payouts} />
      </section>
    </div>
  );
}
