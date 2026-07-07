import { createClient } from "@supabase/supabase-js";
import FeedbackButtons from "./feedback-buttons";

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
  overall_recommendation: string | null;
  verified_relocation: string | null;
  verified_notice: string | null;
  resume_file_url: string | null;
  stage: string;
  client_feedback: string | null;
};

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

  const recommended = rows.filter((r) => r.overall_recommendation === "Strong Fit");
  const others = rows.filter((r) => r.overall_recommendation !== "Strong Fit");

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
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-4">
        {[...recommended, ...others].map((c) => (
          <CandidateCard key={c.link_id} candidate={c} recommended={recommended.includes(c)} token={token} />
        ))}
      </main>
    </div>
  );
}

function CandidateCard({
  candidate,
  recommended,
  token,
}: {
  candidate: ShortlistRow;
  recommended: boolean;
  token: string;
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
        {candidate.resume_file_url && (
          <a
            href={`https://qdbxrspvnglbrvzfqhhg.supabase.co/storage/v1/object/public/resumes/${candidate.resume_file_url}`}
            target="_blank"
            className="text-sm text-blue-600 hover:underline shrink-0"
          >
            Resume →
          </a>
        )}
      </div>

      {candidate.ai_summary && (
        <p className="text-sm text-slate-700 mt-3">{candidate.ai_summary}</p>
      )}

      <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
        <div>
          <p className="text-xs text-slate-400">Sub-domain</p>
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
      </div>

      <FeedbackButtons token={token} linkId={candidate.link_id} current={candidate.client_feedback} />
    </div>
  );
}
