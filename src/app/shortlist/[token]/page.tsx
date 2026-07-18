import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import FeedbackButtons from "./feedback-buttons";
import ResumePreview from "./resume-preview";
import ProfilePassportTrigger from "./profile-passport";

type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  resume_highlights?: string[];
};

type ShortlistRow = {
  link_id: string;
  mandate_id: string;
  client_name: string;
  role_title: string;
  candidate_id: string;
  full_name: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | null;
  expected_fixed_ctc: number | null;
  expected_variable_ctc: number | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  industries: string[] | null;
  ai_summary: string | null;
  ai_passport: AiPassport | null;
  overall_recommendation: string | null;
  verified_relocation: string | null;
  verified_notice: string | null;
  notice_period: string | null;
  resume_file_url: string | null;
  stage: string;
  client_feedback: string | null;
  requested_interview_at: string | null;
  confirmed_interview_at: string | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function passportRank(r: ShortlistRow): number {
  const recommended = r.overall_recommendation === "Strong Fit" ? 0 : 2;
  const pending = r.client_feedback ? 1 : 0;
  return recommended + pending;
}

// Signed URLs are generated with the service-role key here, gated entirely by the
// same token check the get_client_shortlist RPC already performs above -- this page
// has no Supabase Auth session (it's a no-login link), so the private 'resumes'
// bucket cannot otherwise be read by a candidate's shortlist card. Requires
// SUPABASE_SERVICE_ROLE_KEY to be set in this project's environment; if it's
// missing, resumes simply won't show a preview link rather than crashing the page.
async function getResumeSignedUrls(paths: string[]): Promise<Record<string, string>> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || paths.length === 0) return {};
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);
  const entries = await Promise.all(
    paths.map(async (path) => {
      const cleanPath = path.replace(/^resumes\//, "");
      const { data, error } = await admin.storage.from("resumes").createSignedUrl(cleanPath, 3600);
      return [path, error ? null : data?.signedUrl ?? null] as const;
    })
  );
  return Object.fromEntries(entries.filter(([, url]) => url !== null)) as Record<string, string>;
}

export default async function ClientShortlistPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase.rpc("get_client_shortlist", {
    p_token: token,
  });

  if (error || !data || data.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md text-center">
          <p className="text-sm font-semibold text-slate-900">
            {error ? error.message : "No candidates in this shortlist yet."}
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Check the link, or reach out to your StaffAnchor recruiter.
          </p>
        </div>
      </div>
    );
  }

  const rows = data as ShortlistRow[];
  const { client_name, role_title } = rows[0];

  const resumePaths = rows.map((r) => r.resume_file_url).filter((p): p is string => !!p);
  const resumeUrls = await getResumeSignedUrls(resumePaths);

  const recommended = rows.filter((r) => r.overall_recommendation === "Strong Fit");
  const others = rows.filter((r) => r.overall_recommendation !== "Strong Fit");
  // Un-responded candidates float to the top of each group so a client isn't
  // re-scanning past ones they've already actioned.
  const orderedRows = [...rows].sort((a, b) => passportRank(a) - passportRank(b));

  const interestedCount = rows.filter((r) => r.client_feedback === "interested").length;
  const interviewCount = rows.filter((r) => r.client_feedback === "interview_requested").length;
  const pendingCount = rows.filter((r) => !r.client_feedback).length;

  const ctcValues = rows.map((r) => r.expected_fixed_ctc).filter((v): v is number => v != null);
  const medianCtc = median(ctcValues);
  // notice_period is a categorical field ("Immediate", "15 days", "30 days", "90+ days"),
  // not a raw day count -- only the first two buckets count as "soon".
  const availableSoonCount = rows.filter(
    (r) => r.notice_period === "Immediate" || r.notice_period === "15 days"
  ).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <p className="text-xs font-semibold tracking-wide text-blue-600 uppercase">
            StaffAnchor Talent Solutions
          </p>
          <h1 className="text-xl font-semibold text-slate-900 mt-1">
            {role_title} — {client_name}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rows.length} candidate{rows.length === 1 ? "" : "s"} shortlisted for your review.
          </p>
          <div className="flex flex-wrap gap-4 mt-4 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600">
              {recommended.length} recommended
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
              {interestedCount} interested
            </span>
            <span className="rounded-full bg-cyan-100 px-3 py-1 font-medium text-cyan-700">
              {interviewCount} interview requested
            </span>
            <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700">
              {pendingCount} awaiting your response
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {(medianCtc !== null || availableSoonCount > 0) && (
          <p className="text-xs text-slate-500 bg-slate-100 rounded-lg px-3.5 py-2">
            {medianCtc !== null && <>Median expected CTC in this shortlist: <span className="font-semibold text-slate-700">₹{medianCtc}L</span></>}
            {medianCtc !== null && availableSoonCount > 0 && " · "}
            {availableSoonCount > 0 && (
              <>
                <span className="font-semibold text-slate-700">{availableSoonCount}</span> of {rows.length} available within 15 days
              </>
            )}
          </p>
        )}
        {orderedRows.map((c) => (
          <CandidateCard
            key={c.link_id}
            candidate={c}
            recommended={recommended.includes(c)}
            token={token}
            resumeUrl={c.resume_file_url ? resumeUrls[c.resume_file_url] : undefined}
          />
        ))}
      </main>
    </div>
  );
}

function CandidateCard({
  candidate,
  recommended,
  token,
  resumeUrl,
}: {
  candidate: ShortlistRow;
  recommended: boolean;
  token: string;
  resumeUrl?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{candidate.full_name}</h2>
            {recommended && (
              <span className="text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium">
                Recommended
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {candidate.current_job_title}
            {candidate.current_employer ? ` at ${candidate.current_employer}` : ""}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {candidate.current_location} · {candidate.total_experience_years ?? "—"} yrs experience
          </p>
        </div>
        {candidate.resume_file_url && resumeUrl && (
          <ResumePreview
            signedUrl={resumeUrl}
            fileName={candidate.resume_file_url.replace(/^resumes\//, "")}
            label="Preview resume"
          />
        )}
      </div>

      {candidate.ai_summary && (
        <p className="text-sm text-slate-700 mt-3 line-clamp-2">{candidate.ai_summary}</p>
      )}
      <ProfilePassportTrigger
        candidateId={candidate.candidate_id}
        token={token}
        fullName={candidate.full_name}
        currentJobTitle={candidate.current_job_title}
        currentEmployer={candidate.current_employer}
        currentLocation={candidate.current_location}
        totalExperienceYears={candidate.total_experience_years}
        subDomain={candidate.sub_domain}
        expectedFixedCtc={candidate.expected_fixed_ctc}
        verifiedRelocation={candidate.verified_relocation}
        verifiedNotice={candidate.verified_notice}
        industries={candidate.industries}
        aiSummary={candidate.ai_summary}
        aiPassport={candidate.ai_passport}
      />
      <Link
        href={`/shortlist/${token}/passport/${candidate.candidate_id}`}
        className="inline-block mt-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        View full Sales Passport →
      </Link>

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div>
          <p className="text-xs text-slate-400">Primary Specialization</p>
          <p className="text-slate-700">{candidate.sub_domain ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Expected fixed CTC</p>
          <p className="text-slate-700">
            {candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Relocation — verified</p>
          <p className="text-slate-700">{candidate.verified_relocation ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Notice period — verified</p>
          <p className="text-slate-700">{candidate.verified_notice ?? "—"}</p>
        </div>
        {candidate.industries && candidate.industries.length > 0 && (
          <div className="col-span-2">
            <p className="text-xs text-slate-400">Industries</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {candidate.industries.map((i) => (
                <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {i}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <FeedbackButtons
        token={token}
        linkId={candidate.link_id}
        current={candidate.client_feedback}
        requestedInterviewAt={candidate.requested_interview_at}
        confirmedInterviewAt={candidate.confirmed_interview_at}
      />
    </div>
  );
}
