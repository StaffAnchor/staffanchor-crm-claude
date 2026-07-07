import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AssessmentForm from "./assessment-form";
import NotesPanel from "./notes-panel";
import StatusControl from "./status-control";
import MandateLinksPanel from "./mandate-links-panel";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (!candidate) notFound();

  const { data: notes } = await supabase
    .from("recruiter_notes")
    .select("id, note_type, content, created_at, author_id")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("id, mandate_id, stage, in_shortlist, rejection_reason, mandates(client_name, role_title)")
    .eq("candidate_id", id);

  const { data: openMandates } = await supabase
    .from("mandates")
    .select("id, client_name, role_title")
    .eq("status", "open");

  const assessment = (candidate.recruiter_assessment ?? {}) as Record<string, unknown>;
  const segment = (candidate.segment_data ?? {}) as Record<string, unknown>;
  const selfAssessment = (candidate.self_assessment ?? {}) as Record<string, unknown>;

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{candidate.full_name}</h1>
              <p className="text-sm text-slate-500">
                {candidate.current_job_title} at {candidate.current_employer}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {candidate.email} · {candidate.phone} · {candidate.current_location}
              </p>
            </div>
            <StatusControl candidateId={candidate.id} currentStatus={candidate.status} />
          </div>

          <div className="grid grid-cols-4 gap-4 mt-6 text-sm">
            <Field label="Category" value={candidate.category?.replace("_", " ")} />
            <Field label="Primary sub-domain" value={candidate.sub_domain} />
            <Field label="Experience" value={`${candidate.total_experience_years ?? "—"} yrs`} />
            <Field label="Notice period" value={candidate.notice_period} />
            <Field label="Current fixed CTC" value={candidate.current_fixed_ctc ? `₹${candidate.current_fixed_ctc}L` : "—"} />
            <Field label="Current variable CTC" value={candidate.current_variable_ctc ? `₹${candidate.current_variable_ctc}L` : "—"} />
            <Field label="Expected fixed CTC" value={candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : "—"} />
            <Field label="ESOPs held" value={candidate.esops_held ? "Yes" : "No"} />
          </div>

          {candidate.secondary_sub_domains?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 mb-1">Secondary sub-domains (tags)</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.secondary_sub_domains.map((tag: string) => (
                  <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {candidate.resume_file_url && (
            <div className="mt-4">
              <a
                href={`https://qdbxrspvnglbrvzfqhhg.supabase.co/storage/v1/object/public/resumes/${candidate.resume_file_url}`}
                target="_blank"
                className="text-sm text-blue-600 hover:underline"
              >
                View resume →
              </a>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            AI summary <span className="text-xs font-normal text-slate-400">(editable, never sent to a client unedited)</span>
          </h2>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">
            {candidate.ai_summary || "Not generated yet."}
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Self-reported (sales) data</h2>
          <pre className="text-xs text-slate-600 bg-slate-50 rounded-lg p-3 overflow-x-auto">
            {JSON.stringify(segment, null, 2)}
          </pre>
          {selfAssessment && Object.keys(selfAssessment).length > 0 && (
            <div className="mt-4 space-y-2">
              {Object.entries(selfAssessment).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs font-medium text-slate-500 uppercase">{k.replace(/_/g, " ")}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <NotesPanel candidateId={candidate.id} notes={notes ?? []} />
      </div>

      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-amber-900 mb-1">
            Recruiter assessment — internal only
          </h2>
          <p className="text-xs text-amber-700 mb-4">
            Never shown to clients. Fill after a real call, using the standard scorecard.
          </p>
          <AssessmentForm candidateId={candidate.id} assessment={assessment} />
        </div>

        <MandateLinksPanel
          candidateId={candidate.id}
          links={(links ?? []) as never}
          openMandates={openMandates ?? []}
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-slate-800 font-medium">{value || "—"}</p>
    </div>
  );
}
