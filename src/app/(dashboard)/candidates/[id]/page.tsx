import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import AssessmentForm from "./assessment-form";
import NotesPanel from "./notes-panel";
import StatusControl from "./status-control";
import MandateLinksPanel from "./mandate-links-panel";
import Tabs from "./tabs";
import Timeline from "./timeline";
import AiSummaryPanel from "./ai-summary-panel";
import SendInviteButton from "./send-invite-button";
import ResumePreview from "./resume-preview";
import DeleteCandidateButton from "./delete-candidate-button";

const CATEGORY_COLOR: Record<string, string> = {
  b2b_sales: "from-blue-400 to-blue-600",
  b2c_sales: "from-fuchsia-400 to-fuchsia-600",
  non_sales: "from-slate-400 to-slate-600",
};

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function humanize(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

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

  let resumeSignedUrl: string | null = null;
  let resumeFileName: string | null = null;
  if (candidate.resume_file_url) {
    // Data has been inconsistent historically -- some rows store the path
    // with a leading "resumes/" bucket-name prefix, some without. Strip it
    // so we always pass a path relative to the bucket itself.
    const rawPath = candidate.resume_file_url as string;
    const cleanPath = rawPath.replace(/^resumes\//, "");
    const { data: signed, error: signError } = await supabase.storage
      .from("resumes")
      .createSignedUrl(cleanPath, 60 * 60);
    if (!signError && signed) {
      resumeSignedUrl = signed.signedUrl;
      resumeFileName = cleanPath.split("/").pop() ?? cleanPath;
    }
  }

  const { data: notes } = await supabase
    .from("recruiter_notes")
    .select("id, note_type, content, created_at, author_id")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("id, at, action, detail")
    .eq("entity", "candidate")
    .eq("entity_id", id)
    .order("at", { ascending: false });

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

  const timelineEvents = [
    {
      id: "created",
      at: candidate.created_at,
      kind: "created" as const,
      label: `Candidate ${candidate.created_by === "recruiter_created" ? "seeded by a recruiter" : "registered"}`,
      detail: candidate.recruiter_seed_note ?? undefined,
    },
    ...(notes ?? []).map((n) => ({
      id: `note-${n.id}`,
      at: n.created_at,
      kind: "note" as const,
      label: `${n.note_type.replace(/_/g, " ")} added`,
      detail: n.content,
    })),
    ...(auditRows ?? [])
      .filter((a) => a.action === "status_change")
      .map((a) => {
        const detail = a.detail as { from?: string; to?: string } | null;
        return {
          id: `audit-${a.id}`,
          at: a.at,
          kind: "status_change" as const,
          label: `Status changed to ${detail?.to?.replace(/_/g, " ") ?? "updated"}`,
          detail: detail?.from ? `From ${detail.from.replace(/_/g, " ")}` : undefined,
        };
      }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const segmentEntries = Object.entries(segment).filter(([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0));

  return (
    <div>
      <Link href="/candidates" className="text-[12px] text-slate-500 hover:text-slate-800">
        ← All candidates
      </Link>

      <div className="bg-white border border-slate-200 rounded-xl p-6 mt-2 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-full bg-gradient-to-br ${
                CATEGORY_COLOR[candidate.category ?? ""] ?? "from-slate-400 to-slate-500"
              } flex items-center justify-center text-lg font-semibold text-white shrink-0`}
            >
              {initialsFor(candidate.full_name)}
            </div>
            <div>
              <h1 className="text-[19px] font-semibold text-slate-900 tracking-tight">{candidate.full_name}</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {candidate.current_job_title}
                {candidate.current_employer ? ` at ${candidate.current_employer}` : ""}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {candidate.email}
                </span>
                {candidate.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {candidate.phone}
                  </span>
                )}
                {candidate.current_location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> {candidate.current_location}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2">
            {candidate.status === "awaiting_input" && <SendInviteButton candidateId={candidate.id} />}
            <StatusControl candidateId={candidate.id} currentStatus={candidate.status} />
            <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.full_name} />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4">
          {candidate.phone && (
            <a href={`tel:${candidate.phone}`} className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition-colors">
              <Phone className="w-3 h-3" /> Call
            </a>
          )}
          {candidate.phone && (
            <a
              href={`https://wa.me/91${candidate.phone.replace(/\D/g, "").slice(-10)}`}
              target="_blank"
              className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition-colors"
            >
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </a>
          )}
          <a href={`mailto:${candidate.email}`} className="flex items-center gap-1.5 text-[12px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition-colors">
            <Mail className="w-3 h-3" /> Email
          </a>
          {resumeSignedUrl && resumeFileName && (
            <ResumePreview signedUrl={resumeSignedUrl} fileName={resumeFileName} />
          )}
          {candidate.resume_file_url && !resumeSignedUrl && (
            <span className="flex items-center gap-1.5 text-[12px] font-medium text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
              <FileText className="w-3 h-3" /> Resume file not found
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100 text-[13px]">
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
            <p className="text-[11px] text-slate-500 mb-1.5">Secondary sub-domains</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.secondary_sub_domains.map((tag: string) => (
                <span key={tag} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2">
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <Tabs
              tabs={[
                {
                  label: "Overview",
                  content: (
                    <div className="space-y-6">
                      <AiSummaryPanel candidateId={candidate.id} initialSummary={candidate.ai_summary} />
                      {(candidate.skills || (candidate.industries && candidate.industries.length > 0)) && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Skills &amp; industries</h3>
                          <div className="space-y-3">
                            {candidate.skills && (
                              <div>
                                <p className="text-[11px] text-slate-400 mb-1.5">Skills</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {candidate.skills.split(",").map((s: string) => s.trim()).filter(Boolean).map((skill: string) => (
                                    <span key={skill} className="text-[11px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                                      {skill}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {candidate.industries && candidate.industries.length > 0 && (
                              <div>
                                <p className="text-[11px] text-slate-400 mb-1.5">Industries worked in</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {candidate.industries.map((i: string) => (
                                    <span key={i} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                      {i}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {segmentEntries.length > 0 && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Sales profile</h3>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            {segmentEntries.map(([k, v]) => (
                              <div key={k}>
                                <p className="text-[11px] text-slate-400">{humanize(k)}</p>
                                <p className="text-[13px] text-slate-700">{formatValue(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {Object.keys(selfAssessment).length > 0 && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 mb-2">Self-reported write-ups</h3>
                          <div className="space-y-3">
                            {Object.entries(selfAssessment).map(([k, v]) => (
                              <div key={k}>
                                <p className="text-[11px] font-medium text-slate-400 uppercase">{humanize(k)}</p>
                                <p className="text-[13px] text-slate-700 whitespace-pre-wrap">{String(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ),
                },
                {
                  label: "Notes",
                  content: <NotesPanel candidateId={candidate.id} notes={notes ?? []} />,
                },
                {
                  label: "Mandates",
                  content: (
                    <MandateLinksPanel
                      candidateId={candidate.id}
                      links={(links ?? []) as never}
                      openMandates={openMandates ?? []}
                    />
                  ),
                },
                {
                  label: "Timeline",
                  content: <Timeline events={timelineEvents} />,
                },
              ]}
            />
          </div>
        </div>

        <div>
          <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-6 shadow-sm sticky top-20">
            <h2 className="text-[13px] font-semibold text-amber-900 mb-1">Recruiter assessment</h2>
            <p className="text-[11px] text-amber-700 mb-4">
              Internal only, never shown to clients. Fill after a real call using the standard scorecard.
            </p>
            <AssessmentForm candidateId={candidate.id} assessment={assessment} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-slate-800 font-medium">{value || "—"}</p>
    </div>
  );
}
