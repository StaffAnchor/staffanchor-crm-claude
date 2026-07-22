import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { SalesPassportView } from "@/components/passport/sales-passport-view";

// Full-page Sales Passport for a hiring manager on the no-login shortlist
// link -- the same read-only view rendered on the recruiter's CRM "Passport"
// tab, with viewer="client" so SalesPassportView itself hides anything
// internal-only (recruiter assessment scores, recommendation, red flags,
// stability/domain-consistency scores). Authorization mirrors
// /api/public-ai-summary/route.ts's shortlist-link path exactly: a valid,
// unexpired token whose shortlist actually includes this candidate_id --
// there's no separate access check beyond that, since a hiring manager
// should be able to see everything on a shortlisted candidate's passport
// that the candidate themselves put in via the onboarding wizard.
export default async function ClientPassportPage({
  params,
}: {
  params: Promise<{ token: string; candidateId: string }>;
}) {
  const { token, candidateId } = await params;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const anon = createClient(supabaseUrl, anonKey);
  const { data: shortlistRows, error: shortlistError } = await anon.rpc("get_client_shortlist", {
    p_token: token,
  });

  const authorized =
    !shortlistError &&
    Array.isArray(shortlistRows) &&
    (shortlistRows as { candidate_id: string }[]).some((r) => r.candidate_id === candidateId);

  if (!authorized || !serviceKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-slate-900">This passport isn&apos;t available.</p>
          <p className="text-sm text-slate-500 mt-1">
            Check the link, or reach out to your StaffAnchor recruiter.
          </p>
        </div>
      </div>
    );
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: candidate } = await admin
    .from("candidates")
    .select(
      "full_name, current_job_title, current_employer, current_location, total_experience_years, sub_domain, secondary_sub_domains, current_fixed_ctc, expected_fixed_ctc, notice_period, open_to_relocation, current_industry, industries, skills, segment_data, career_timeline_profile, recruiter_assessment"
    )
    .eq("id", candidateId)
    .single();

  if (!candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <p className="text-sm text-slate-500">Candidate not found.</p>
      </div>
    );
  }

  // relocation_verified / notice_verified live inside recruiter_assessment
  // jsonb (see assessment-form.tsx), not as their own candidates columns --
  // same fields the get_client_shortlist RPC aliases to verified_relocation/
  // verified_notice for the shortlist card above.
  const assessment = (candidate.recruiter_assessment ?? {}) as Record<string, unknown>;
  const verifiedRelocation = (assessment.relocation_verified as string | undefined) ?? null;
  const verifiedNotice = (assessment.notice_verified as string | undefined) ?? null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
            StaffAnchor Talent Solutions
          </p>
          <Link
            href={`/shortlist/${token}`}
            className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mt-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to shortlist
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-8">
        <SalesPassportView
          viewer="client"
          fullName={candidate.full_name}
          currentJobTitle={candidate.current_job_title}
          currentEmployer={candidate.current_employer}
          currentLocation={candidate.current_location}
          totalExperienceYears={candidate.total_experience_years}
          subDomain={candidate.sub_domain}
          secondarySubDomains={candidate.secondary_sub_domains}
          currentFixedCtc={candidate.current_fixed_ctc}
          expectedFixedCtc={candidate.expected_fixed_ctc}
          noticePeriod={candidate.notice_period}
          verifiedRelocation={verifiedRelocation}
          openToRelocation={candidate.open_to_relocation}
          verifiedNotice={verifiedNotice}
          currentIndustry={candidate.current_industry}
          industries={candidate.industries}
          skills={candidate.skills}
          segmentData={candidate.segment_data}
          careerTimeline={candidate.career_timeline_profile}
        />
      </main>
    </div>
  );
}
