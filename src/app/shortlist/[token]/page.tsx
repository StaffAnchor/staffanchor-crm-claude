import Link from "next/link";
import { formatExperience } from "@/lib/format-experience";
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
  current_fixed_ctc: number | null;
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

const AVATAR_TONES = [
  "from-blue-500 to-indigo-600",
  "from-teal-500 to-emerald-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

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
      <header className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white">
        <div className="max-w-3xl mx-auto px-6 pt-8 pb-7">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-[13px] font-bold shrink-0">
              S
            </div>
            <p className="text-xs font-semibold tracking-wide text-blue-300 uppercase">
              StaffAnchor Talent Solutions
            </p>
          </div>
          <h1 className="text-2xl font-semibold text-white mt-3 tracking-tight">{role_title}</h1>
          <p className="text-sm text-slate-300 mt-1">
            Mandate for <span className="font-medium text-white">{client_name}</span> · {rows.length} candidate
            {rows.length === 1 ? "" : "s"} shortlisted for your review
          </p>
          <div className="flex flex-wrap gap-2 mt-5 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1.5 font-medium text-slate-200 ring-1 ring-white/10">
              {recommended.length} recommended
            </span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 font-medium text-emerald-300 ring-1 ring-emerald-400/20">
              {interestedCount} interested
            </span>
            <span className="rounded-full bg-cyan-500/15 px-3 py-1.5 font-medium text-cyan-300 ring-1 ring-cyan-400/20">
              {interviewCount} interview requested
            </span>
            <span className="rounded-full bg-amber-500/15 px-3 py-1.5 font-medium text-amber-300 ring-1 ring-amber-400/20">
              {pendingCount} awaiting your response
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {(medianCtc !== null || availableSoonCount > 0) && (
          <p className="text-xs text-slate-500 bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 shadow-sm">
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
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5 min-w-0">
          <div
            className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarTone(
              candidate.full_name
            )} flex items-center justify-center text-white text-[15px] font-semibold shrink-0 shadow-sm`}
          >
            {initials(candidate.full_name)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-slate-900">{candidate.full_name}</h2>
              {recommended && (
                <span className="text-[11px] bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full font-medium">
                  Recommended
                </span>
              )}
            </div>
            <p className="text-sm text-slate-600 mt-0.5">
              {candidate.current_job_title}
              {candidate.current_employer ? ` at ${candidate.current_employer}` : ""}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              {candidate.current_location} · {formatExperience(candidate.total_experience_years)} experience
            </p>
          </div>
        </div>
        {candidate.resume_file_url && resumeUrl && (
          <div className="shrink-0">
            <ResumePreview
              signedUrl={resumeUrl}
              fileName={candidate.resume_file_url.replace(/^resumes\//, "")}
              label="Preview resume"
            />
          </div>
        )}
      </div>

      {candidate.ai_summary && (
        <p className="text-sm text-slate-700 mt-4 pl-3.5 border-l-2 border-blue-200 leading-relaxed line-clamp-2">
          {candidate.ai_summary}
        </p>
      )}

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <ProfilePassportTrigger
          candidateId={candidate.candidate_id}
          token={token}
          fullName={candidate.full_name}
          currentJobTitle={candidate.current_job_title}
          currentEmployer={candidate.current_employer}
          currentLocation={candidate.current_location}
          totalExperienceYears={candidate.total_experience_years}
          subDomain={candidate.sub_domain}
          currentFixedCtc={candidate.current_fixed_ctc}
          expectedFixedCtc={candidate.expected_fixed_ctc}
          verifiedRelocation={candidate.verified_relocation}
          verifiedNotice={candidate.verified_notice}
          industries={candidate.industries}
          aiSummary={candidate.ai_summary}
          aiPassport={candidate.ai_passport}
        />
        <Link
          href={`/shortlist/${token}/passport/${candidate.candidate_id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          View full Sales Passport →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
        <StatChip label="Primary Specialization" value={candidate.sub_domain ?? "—"} />
        <StatChip
          label="Current fixed CTC"
          value={candidate.current_fixed_ctc ? `₹${candidate.current_fixed_ctc}L` : "—"}
        />
        <StatChip
          label="Expected fixed CTC"
          value={candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : "—"}
        />
        <StatChip label="Relocation — verified" value={candidate.verified_relocation ?? "—"} />
        <StatChip label="Notice period — verified" value={candidate.verified_notice ?? "—"} />
      </div>

      {candidate.industries && candidate.industries.length > 0 && (
        <div className="mt-3">
          <p className="text-[11px] text-slate-400 mb-1.5">Industries</p>
          <div className="flex flex-wrap gap-1.5">
            {candidate.industries.map((i) => (
              <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                {i}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100">
        <FeedbackButtons
          token={token}
          linkId={candidate.link_id}
          current={candidate.client_feedback}
          requestedInterviewAt={candidate.requested_interview_at}
          confirmedInterviewAt={candidate.confirmed_interview_at}
        />
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
      <p className="text-[10.5px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-[13.5px] font-semibold text-slate-800 mt-0.5">{value}</p>
    </div>
  );
}
