import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import type { ReferralJourneyData } from "./referral-journey-row";
import ReferralsBoard from "./referrals-board";

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
  // No join to mandates: that would pull in the client name. Role titles come
  // from a function that returns the title only.
  const { data: referrals } = await supabase
    .from("sales_circle_referrals")
    .select(
      "id, candidate_name, candidate_current_company, status, status_reason, created_at, mandate_id, resume_file_path, candidate_sales_experience, candidate_total_experience_years, candidate_expected_ctc, candidate_notice_period, why_fit"
    )
    .order("created_at", { ascending: false });

  const { data: roleTitles } = await supabase.rpc("referrer_role_titles");
  const titleById = new Map(((roleTitles ?? []) as { id: string; role_title: string }[]).map((r) => [r.id, r.role_title]));

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

  const journeyData: ReferralJourneyData[] = (referrals ?? []).map((r) => ({
    id: r.id,
    candidate_name: r.candidate_name,
    candidate_current_company: r.candidate_current_company,
    status: r.status,
    created_at: r.created_at,
    role_title: r.mandate_id ? titleById.get(r.mandate_id) ?? null : null,
    resume_signed_url: r.resume_file_path ? resumeUrlByPath[r.resume_file_path] ?? null : null,
    candidate_sales_experience: r.candidate_sales_experience,
    candidate_total_experience_years: r.candidate_total_experience_years,
    candidate_expected_ctc: r.candidate_expected_ctc,
    candidate_notice_period: r.candidate_notice_period,
    why_fit: r.why_fit,
    history: historyByReferral.get(r.id) ?? [],
  }));

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8">
      <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">My referrals</h1>
      <p className="mt-1 text-[14px] text-slate-500">Everyone you&apos;ve referred and exactly where they are. Open a name to see their full journey.</p>

      {journeyData.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
          <p className="text-[15px] font-medium text-slate-700">You haven&apos;t referred anyone yet</p>
          <p className="mt-1 text-[13px] text-slate-400">Pick a role that fits someone you know, and we&apos;ll take it from there.</p>
          <Link href="/referrer/roles" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-700">
            See open roles
          </Link>
        </div>
      ) : (
        <div className="mt-6">
          <ReferralsBoard referrals={journeyData} />
        </div>
      )}
    </div>
  );
}
