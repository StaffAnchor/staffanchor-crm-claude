import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import ReferralJourneyRow, { type ReferralJourneyData } from "./referral-journey-row";

// Referrer-facing status list with a per-referral journey timeline.
// internal_notes is deliberately never selected here -- referrers see
// stage only, never client-internal notes, per spec section 4. Every
// status value in the enum is itself referrer-safe by design, so no
// filtering is needed beyond just not selecting internal_notes.
//
// History rows come from sales_circle_referral_status_history via the
// cookie-authed client -- referrers already have a SELECT policy scoped to
// their own referrals' history, so no service-role needed there. Resume
// signed URLs, however, use the service-role client since there's no
// referrer-facing storage policy on the resumes bucket (same as the
// upload path in api/referrer/referrals/route.ts).
export default async function MyReferralsPage() {
  const supabase = await createClient();
  const { data: referrals } = await supabase
    .from("sales_circle_referrals")
    .select(
      "id, candidate_name, candidate_current_company, status, status_reason, created_at, mandate_id, resume_file_path, candidate_sales_experience, candidate_total_experience_years, candidate_expected_ctc, candidate_notice_period, why_fit, mandates(role_title, client_name)"
    )
    .order("created_at", { ascending: false });

  const referralIds = (referrals ?? []).map((r) => r.id);
  const { data: historyRaw } = referralIds.length
    ? await supabase
        .from("sales_circle_referral_status_history")
        .select("id, referral_id, from_status, to_status, created_at")
        .in("referral_id", referralIds)
        .order("created_at", { ascending: true })
    : { data: [] };

  const historyByReferral = new Map<string, { id: string; from_status: string | null; to_status: string; created_at: string }[]>();
  for (const h of historyRaw ?? []) {
    const list = historyByReferral.get(h.referral_id) ?? [];
    list.push(h);
    historyByReferral.set(h.referral_id, list);
  }

  const resumePaths = (referrals ?? []).map((r) => r.resume_file_path).filter((p): p is string => !!p);
  const resumeUrlByPath: Record<string, string> = {};
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (serviceKey && resumePaths.length > 0) {
    const admin = createSupabaseClient(supabaseUrl, serviceKey);
    const { data: signedBatch } = await admin.storage.from("resumes").createSignedUrls(resumePaths, 60 * 60 * 12);
    for (const s of signedBatch ?? []) {
      if (s.path && s.signedUrl) resumeUrlByPath[s.path] = s.signedUrl;
    }
  }

  const journeyData: ReferralJourneyData[] = (referrals ?? []).map((r) => {
    const mandate = Array.isArray(r.mandates) ? r.mandates[0] : r.mandates;
    return {
      id: r.id,
      candidate_name: r.candidate_name,
      candidate_current_company: r.candidate_current_company,
      status: r.status,
      created_at: r.created_at,
      role_title: mandate?.role_title ?? null,
      client_name: mandate?.client_name ?? null,
      resume_signed_url: r.resume_file_path ? resumeUrlByPath[r.resume_file_path] ?? null : null,
      candidate_sales_experience: r.candidate_sales_experience,
      candidate_total_experience_years: r.candidate_total_experience_years,
      candidate_expected_ctc: r.candidate_expected_ctc,
      candidate_notice_period: r.candidate_notice_period,
      why_fit: r.why_fit,
      history: historyByReferral.get(r.id) ?? [],
    };
  });

  return (
    <div className="max-w-[900px] mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">My Referrals</h1>
      <p className="text-sm text-slate-500 mt-1">Every candidate you&apos;ve referred, and where they are. Tap a row to see the full journey.</p>

      {journeyData.length === 0 ? (
        <p className="text-sm text-slate-400 mt-8">No referrals yet. Head to Roles or Refer someone to get started.</p>
      ) : (
        <div className="mt-6 divide-y divide-slate-100 bg-white rounded-xl border border-slate-200">
          {journeyData.map((r) => (
            <ReferralJourneyRow key={r.id} referral={r} />
          ))}
        </div>
      )}
    </div>
  );
}
