import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

// Blind-brief roles board -- reuses mandates.budget_min/max, team_size_band,
// company_size_band, city, must_haves rather than duplicating role content
// into a new table, since those fields already exist and already power the
// public_client_label/show_client_name blind pattern on the candidate-facing
// jobs site. The admin opts a mandate into this board explicitly via
// referral_visible (a mandate being open internally doesn't automatically
// make it visible here) rather than trying to map mandates.status onto the
// spec's open/on-hold/closed tri-state -- admin flips referral_visible off
// when a role should stop showing, which covers both "on hold" and "closed"
// with one control for MVP.
function formatLakhs(n: number | null): string {
  if (n == null) return "—";
  return `₹${(n / 100000).toFixed(1)}L`;
}

export default async function ReferrerRolesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("sales_circle_referrer_id")
    .eq("id", user!.id)
    .single();
  const { data: referrer } = profile?.sales_circle_referrer_id
    ? await supabase.from("sales_circle_referrers").select("tier").eq("id", profile.sales_circle_referrer_id).single()
    : { data: null };
  const isTrusted = referrer?.tier === "trusted";

  const { data: mandates } = await supabase
    .from("mandates")
    .select(
      "id, role_title, category, sub_domain, city, budget_min, budget_max, team_size_band, company_size_band, must_haves, client_name, referral_reveal_company_to_trusted, referral_summary"
    )
    .eq("referral_visible", true)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  const { data: slabs } = await supabase
    .from("sales_circle_payout_slabs")
    .select("ctc_band_min, ctc_band_max, payout_amount")
    .eq("active", true)
    .order("ctc_band_min", { ascending: true });

  function payoutFor(budgetMax: number | null): number | null {
    if (budgetMax == null || !slabs) return null;
    const slab = slabs.find((s) => budgetMax >= s.ctc_band_min && (s.ctc_band_max == null || budgetMax < s.ctc_band_max));
    return slab?.payout_amount ?? null;
  }

  return (
    <div className="max-w-[1100px] mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Open roles</h1>
      <p className="text-sm text-slate-500 mt-1">
        Curated sales roles from StaffAnchor&apos;s client mandates. Company names are hidden by default
        {isTrusted ? " — as a Trusted referrer, you'll see the company name on roles that reveal it." : "."}
      </p>

      {!mandates || mandates.length === 0 ? (
        <p className="text-sm text-slate-400 mt-8">No open roles right now — check back soon.</p>
      ) : (
        <div className="grid gap-3 mt-6">
          {mandates.map((m) => {
            const revealCompany = isTrusted && m.referral_reveal_company_to_trusted;
            const payout = payoutFor(m.budget_max);
            return (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[15px] font-semibold text-slate-900">{m.role_title}</h2>
                    <p className="text-[12px] text-slate-400 mt-0.5">
                      {revealCompany ? m.client_name : "Company hidden"} · {m.city ?? "Location flexible"}
                    </p>
                  </div>
                  {payout != null && (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wide text-slate-400">Payout</div>
                      <div className="text-[15px] font-semibold text-emerald-600">
                        ₹{payout.toLocaleString("en-IN")}
                      </div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
                  <Stat label="Sector" value={m.sub_domain ?? m.category?.replace(/_/g, " ") ?? "—"} />
                  <Stat label="CTC band" value={`${formatLakhs(m.budget_min)} – ${formatLakhs(m.budget_max)}`} />
                  <Stat label="Team size" value={m.team_size_band ?? "—"} />
                  <Stat label="Company size" value={m.company_size_band ?? "—"} />
                </div>
                {m.referral_summary ? (
                  <p className="text-[13px] text-slate-600 mt-3 leading-relaxed">{m.referral_summary}</p>
                ) : (
                  m.must_haves &&
                  m.must_haves.length > 0 && (
                    <p className="text-[12px] text-slate-500 mt-3">
                      <span className="font-medium text-slate-600">Key requirements: </span>
                      {m.must_haves.join(", ")}
                    </p>
                  )
                )}
                <Link
                  href={`/referrer/refer?mandate=${m.id}`}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-slate-900 mt-4"
                >
                  Refer someone for this role →
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[13px] font-medium text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}
