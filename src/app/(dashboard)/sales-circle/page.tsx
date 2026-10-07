import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import ReferrerApplicationsPanel from "./referrer-applications-panel";
import ReferrersTable from "./referrers-table";
import ReferralsAdmin, { type AdminReferral } from "./referrals-admin";
import RolesAdmin, { type AdminRole } from "./roles-admin";
import { ctcBand, inr } from "@/lib/sales-circle";
import PayoutSlabsPanel from "./payout-slabs-panel";
import PayoutsPanel from "./payouts-panel";

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
    .select("id, full_name, email, status, tier, current_company, created_at, tos_accepted_at, invite_token_expires_at")
    .order("created_at", { ascending: false });

  const { data: referralsRaw } = await supabase
    .from("sales_circle_referrals")
    .select(
      "id, candidate_name, candidate_phone, candidate_email, candidate_linkedin_url, status, created_at, referrer_id, mandate_id, resume_file_path, candidate_sales_experience, candidate_total_experience_years, candidate_expected_ctc, candidate_notice_period, why_fit, sales_circle_referrers(full_name), mandates(role_title, client_name, budget_min, budget_max)"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const referralResumePaths = (referralsRaw ?? []).map((r) => r.resume_file_path).filter((p): p is string => !!p);
  const referralResumeUrlByPath: Record<string, string> = {};
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (serviceKey && referralResumePaths.length > 0) {
    const admin = createSupabaseClient(supabaseUrl, serviceKey);
    const { data: signedBatch } = await admin.storage.from("resumes").createSignedUrls(referralResumePaths, 60 * 60 * 12);
    for (const s of signedBatch ?? []) {
      if (s.path && s.signedUrl) referralResumeUrlByPath[s.path] = s.signedUrl;
    }
  }

  const referrals: AdminReferral[] = (referralsRaw ?? []).map((r) => {
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
      ctc: ctcBand(mandate?.budget_min, mandate?.budget_max),
      details: {
        resume_signed_url: r.resume_file_path ? referralResumeUrlByPath[r.resume_file_path] ?? null : null,
        candidate_sales_experience: r.candidate_sales_experience,
        candidate_total_experience_years: r.candidate_total_experience_years,
        candidate_expected_ctc: r.candidate_expected_ctc,
        candidate_notice_period: r.candidate_notice_period,
        why_fit: r.why_fit,
        candidate_phone: r.candidate_phone,
        candidate_email: r.candidate_email,
        candidate_linkedin_url: r.candidate_linkedin_url,
      },
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

  const { data: roleRows } = await supabase
    .from("mandates")
    .select(
      "id, role_title, client_name, status, is_archived, category, sub_domain, city, cities, work_mode, working_days, week_off, shift_timing, experience_min, experience_max, budget_min, budget_max, team_size_band, company_size_band, team_handling, sales_cycle, deal_size_currency, deal_size_band, selling_style, languages_required, industries_sold_to, seniority_band, must_haves, good_to_haves, referral_summary, referral_visible, referral_reveal_company_to_trusted, created_at"
    )
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(200);
  const adminRoles = ((roleRows ?? []) as unknown as AdminRole[]).map((r) => ({ ...r, company_name: null, payout_amount: null }));

  // Headline numbers for the strip at the top.
  const today = new Date().getTime();
  const approved = (referrers ?? []).filter((r) => r.status === "approved");
  const joinedReferrers = approved.filter((r) => r.tos_accepted_at).length;
  const notJoinedYet = approved.length - joinedReferrers;
  const rolesLive = adminRoles.filter((r) => r.referral_visible).length;
  const needsScreening = referrals.filter((r) => r.status === "submitted").length;
  const waitingLong = referrals.filter((r) => r.status === "submitted" && today - new Date(r.created_at).getTime() > 2 * 86_400_000).length;
  const inProgress = referrals.filter((r) => !["submitted", "joined", "ninety_days_completed", "payment_received", "payout_processed", "not_suitable", "candidate_declined", "dropped_out", "left_before_90_days"].includes(r.status)).length;
  const toPay = payouts.filter((p) => p.status === "eligible").reduce((a, p) => a + Number(p.computed_payout_amount ?? p.slab_amount ?? 0), 0);
  const onItsWay = payouts.filter((p) => p.status === "pending").reduce((a, p) => a + Number(p.computed_payout_amount ?? p.slab_amount ?? 0), 0);
  const applicationsWaiting = (pendingApplications ?? []).length;

  const kpis: { label: string; value: string; sub: string; href: string; tone?: "alert" }[] = [
    { label: "Applications", value: String(applicationsWaiting), sub: applicationsWaiting ? "waiting for review" : "all reviewed", href: "#applications", tone: applicationsWaiting ? "alert" : undefined },
    { label: "Referrers", value: String(joinedReferrers), sub: notJoinedYet ? `${notJoinedYet} approved, not joined yet` : "active", href: "#referrers", tone: notJoinedYet ? "alert" : undefined },
    { label: "Roles live", value: String(rolesLive), sub: `${adminRoles.filter((r) => r.referral_visible).length ? "on the referrer board" : "none on the board yet"}`, href: "#roles" },
    { label: "To screen", value: String(needsScreening), sub: waitingLong ? `${waitingLong} waiting over 2 days` : "referrals", href: "#referrals", tone: waitingLong ? "alert" : undefined },
    { label: "In progress", value: String(inProgress), sub: "referrals moving", href: "#referrals" },
    { label: "Payouts", value: inr(toPay), sub: `${inr(onItsWay)} on its way`, href: "#payouts", tone: toPay ? "alert" : undefined },
  ];

  const jump = [
    ["#applications", "Applications"],
    ["#referrers", "Referrers"],
    ["#roles", "Roles"],
    ["#referrals", "Referrals"],
    ["#payouts", "Payouts"],
    ["#slabs", "Payout slabs"],
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-8 px-5 py-8">
      <div>
        <h1 className="text-ros-display mb-1 font-semibold tracking-tight text-slate-900 dark:text-slate-100">Sales Circle</h1>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Your referral network: who applies, which roles they see, who they refer, and what they earn.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <a
            key={k.label}
            href={k.href}
            className={`rounded-xl border bg-white p-4 transition-shadow hover:shadow-sm dark:bg-slate-900 ${k.tone === "alert" ? "border-amber-300 dark:border-amber-700" : "border-slate-200 dark:border-slate-700"}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k.label}</div>
            <div className="mt-1 text-[24px] font-bold leading-none text-slate-900 dark:text-slate-100">{k.value}</div>
            <div className={`mt-1.5 text-[11.5px] ${k.tone === "alert" ? "font-medium text-amber-700 dark:text-amber-400" : "text-slate-500 dark:text-slate-400"}`}>{k.sub}</div>
          </a>
        ))}
      </div>

      <nav className="sticky top-0 z-20 -mx-1 flex flex-wrap gap-1 bg-white/90 px-1 py-2 backdrop-blur dark:bg-slate-950/90">
        {jump.map(([href, label]) => (
          <a key={href} href={href} className="rounded-full px-3 py-1 text-[12.5px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            {label}
          </a>
        ))}
      </nav>

      <section id="applications" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Pending applications</h2>
        <ReferrerApplicationsPanel applications={pendingApplications ?? []} />
      </section>

      <section id="referrers" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Referrers</h2>
        <ReferrersTable referrers={referrers ?? []} />
      </section>

      <section id="roles" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Roles on the referrer board</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">
          Choose which open roles referrers can see. Each role shows how complete it is, so referrers see clear CTC, experience and requirements. Use
          &ldquo;Preview as referrer&rdquo; to see exactly what they get. The client name stays hidden unless you reveal it to Trusted referrers.
        </p>
        <RolesAdmin roles={adminRoles} slabs={slabs ?? []} />
      </section>

      <section id="referrals" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Referrals</h2>
        <ReferralsAdmin referrals={referrals} />
      </section>

      <section id="payouts" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Payouts</h2>
        <PayoutsPanel payouts={payouts} />
      </section>

      <section id="slabs" className="scroll-mt-16 space-y-3">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Payout slabs</h2>
        <p className="text-[12px] text-slate-500 dark:text-slate-400">What a referrer earns for a role, by the role&apos;s annual CTC budget. A role&apos;s budget is matched to a band automatically.</p>
        <PayoutSlabsPanel slabs={slabs ?? []} />
      </section>
    </div>
  );
}
