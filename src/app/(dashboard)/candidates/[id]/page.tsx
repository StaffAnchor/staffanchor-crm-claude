import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import AssessmentForm from "./assessment-form";
import VettingScorePanel from "./vetting-score-panel";
import MandateDiscussions from "./mandate-discussions";
import CareerTimelinePanel from "./career-timeline-panel";
import NotesPanel from "./notes-panel";
import VerifiedFactsPanel from "./verified-facts-panel";
import StatusControl from "./status-control";
import MandateLinksPanel from "./mandate-links-panel";
import Tabs from "./tabs";
import Timeline from "./timeline";
import AiSummaryPanel from "./ai-summary-panel";
import SendInviteButton from "./send-invite-button";
import ResumePreview from "./resume-preview";
import DeleteCandidateButton from "./delete-candidate-button";
import EditProfileButton from "./edit-profile-button";
import QuickContactActions from "./quick-contact-actions";
import ActivityLogPanel from "./activity-log-panel";
import WhatsAppPanel from "./whatsapp-panel";
import { formatExperience } from "@/lib/format-experience";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";

// ROS design language: one neutral avatar treatment for every candidate --
// no per-category color-coding (see candidates-table.tsx for the reasoning:
// color-coding a value that's already shown elsewhere on the page is noise,
// not signal).
function initialsFor(name: string | null | undefined) {
  if (!name) return "?";
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

const RECOMMENDATION_TONE: Record<string, BadgeTone> = {
  "Strong Fit": "success",
  "Fit with Reservations": "warning",
  "Not a Fit": "danger",
};

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; mandateId?: string; groupId?: string; back?: string; box?: string }>;
}) {
  const { id } = await params;
  const { from, mandateId, groupId, back, box } = await searchParams;
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (!candidate) notFound();

  // Attributed to whoever actually saves the vetting score (vetting-score-panel.tsx),
  // same "who did this, not who owns the record" principle as profile_completed_by.
  const {
    data: { user: viewerUser },
  } = await supabase.auth.getUser();
  const { data: viewerProfile } = viewerUser
    ? await supabase.from("profiles").select("full_name, email").eq("id", viewerUser.id).single()
    : { data: null };
  const scorerName = viewerProfile?.full_name ?? viewerProfile?.email ?? "Unknown";

  // Smart regenerate-on-view: if the recruiter's manual assessment
  // (communication/confidence/attitude/job_stability scorecard) was saved
  // more recently than the last AI generation, refresh the AI summary right
  // now so it actually reflects the assessment -- but ONLY when something
  // new exists to incorporate. Regenerating on every single profile open
  // would burn through Gemini's free-tier quota almost immediately (we've
  // already seen real 429s in production logs at a 20-requests/day limit),
  // so this only fires on the rare "assessment just changed" case, not on
  // routine browsing.
  if (
    candidate.recruiter_assessment_updated_at &&
    (!candidate.ai_summary_generated_at ||
      new Date(candidate.recruiter_assessment_updated_at as string) >
        new Date(candidate.ai_summary_generated_at as string))
  ) {
    const result = await generateAiPassportForCandidate(candidate.id, supabase, {
      note: "auto_regenerated_on_view_after_assessment",
    });
    if (result.ok) {
      candidate.ai_summary = result.summary;
      candidate.ai_passport = result.passport;
      candidate.ai_decision_flags = result.decisionFlags;
      candidate.skill_inventory = result.skillInventory;
      candidate.stability_score = result.stabilityScore;
    }
  }

  // Prev/next navigation within whatever filtered list the recruiter came
  // from -- `from` is the exact query string of /candidates?... they were
  // browsing, carried onto this row's link. Re-running that same filter
  // (id-only, same default ordering) lets us find this candidate's
  // neighbors without keeping any list state around. Replaces the old
  // per-section sidebar, which was meaningless on a single-candidate page.
  //
  // `mandateId` is the mandate-context equivalent: set when a candidate is
  // opened from a mandate's Board/Table view (see mandate-candidates-table
  // / -board.tsx), so "back" returns to that specific mandate's candidate
  // list instead of the global /candidates page, and prev/next walk that
  // mandate's roster instead of the firm-wide one.
  let prevCandidate: { id: string; full_name: string } | null = null;
  let nextCandidate: { id: string; full_name: string } | null = null;
  let listPosition: { index: number; total: number } | null = null;
  let backLabel = "← All candidates";
  let backHref = from ? `/candidates?${from}` : "/candidates";

  if (mandateId) {
    const { data: mandateRow } = await supabase
      .from("mandates")
      .select("role_title, client_name")
      .eq("id", mandateId)
      .single();
    backHref = `/mandates/${mandateId}`;
    backLabel = mandateRow ? `← ${mandateRow.role_title} — ${mandateRow.client_name}` : "← Back to mandate";

    const { data: mandateLinkRows } = await supabase
      .from("candidate_mandate_links")
      .select("candidate_id, created_at, candidates(id, full_name)")
      .eq("mandate_id", mandateId)
      .order("created_at", { ascending: true });
    if (mandateLinkRows) {
      const roster = mandateLinkRows
        .map((r) => r.candidates as unknown as { id: string; full_name: string } | null)
        .filter((c): c is { id: string; full_name: string } => c !== null);
      const idx = roster.findIndex((r) => r.id === id);
      if (idx !== -1) {
        listPosition = { index: idx + 1, total: roster.length };
        prevCandidate = idx > 0 ? roster[idx - 1] : null;
        nextCandidate = idx < roster.length - 1 ? roster[idx + 1] : null;
      }
    }
  } else if (groupId) {
    const { data: groupRow } = await supabase
      .from("candidate_groups")
      .select("name")
      .eq("id", groupId)
      .single();
    backHref = `/candidates/groups/${groupId}`;
    backLabel = groupRow ? `← ${groupRow.name}` : "← Back to group";

    const { data: groupMemberRows } = await supabase
      .from("candidate_group_members")
      .select("candidate_id, added_at, candidates(id, full_name)")
      .eq("group_id", groupId)
      .order("added_at", { ascending: true });
    if (groupMemberRows) {
      const roster = groupMemberRows
        .map((r) => r.candidates as unknown as { id: string; full_name: string } | null)
        .filter((c): c is { id: string; full_name: string } => c !== null);
      const idx = roster.findIndex((r) => r.id === id);
      if (idx !== -1) {
        listPosition = { index: idx + 1, total: roster.length };
        prevCandidate = idx > 0 ? roster[idx - 1] : null;
        nextCandidate = idx < roster.length - 1 ? roster[idx + 1] : null;
      }
    }
  } else if (from) {
    const listParams = new URLSearchParams(from);
    let listQuery = supabase
      .from("candidates")
      .select("id, full_name")
      .order("created_at", { ascending: false })
      .limit(100);

    const q = listParams.get("q");
    const category = listParams.get("category");
    const status = listParams.get("status");
    const minCtc = listParams.get("min_ctc");
    const maxCtc = listParams.get("max_ctc");
    const minExp = listParams.get("min_exp");
    const subDomain = listParams.get("sub_domain");
    const location = listParams.get("location");
    const currentIndustry = listParams.get("current_industry");
    const origin = listParams.get("origin");
    const incomplete = listParams.get("incomplete");
    const noticePeriod = listParams.get("notice_period");
    const recommendation = listParams.get("recommendation");

    if (q) listQuery = listQuery.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,current_employer.ilike.%${q}%`);
    if (category) listQuery = listQuery.eq("category", category);
    if (status) listQuery = listQuery.eq("status", status);
    if (minCtc) listQuery = listQuery.gte("current_fixed_ctc", Number(minCtc));
    if (maxCtc) listQuery = listQuery.lte("current_fixed_ctc", Number(maxCtc));
    if (minExp) listQuery = listQuery.gte("total_experience_years", Number(minExp));
    if (subDomain) listQuery = listQuery.eq("sub_domain", subDomain);
    if (location) listQuery = listQuery.ilike("current_location", `%${location}%`);
    if (currentIndustry) listQuery = listQuery.eq("current_industry", currentIndustry);
    if (origin) listQuery = listQuery.eq("created_by", origin);
    if (incomplete) listQuery = listQuery.in("status", ["awaiting_input", "lead"]);
    if (noticePeriod) listQuery = listQuery.eq("notice_period", noticePeriod);
    if (recommendation) listQuery = listQuery.eq("recruiter_assessment->>overall_recommendation", recommendation);

    const { data: listRows } = await listQuery;
    if (listRows) {
      const idx = listRows.findIndex((r) => r.id === id);
      if (idx !== -1) {
        listPosition = { index: idx + 1, total: listRows.length };
        prevCandidate = idx > 0 ? listRows[idx - 1] : null;
        nextCandidate = idx < listRows.length - 1 ? listRows[idx + 1] : null;
      }
    }
  }

  // Opened from a My Desk task with no mandate context (e.g. a
  // profile-completion or pipeline task) -- overrides whatever
  // backHref/backLabel the mandateId/groupId/from branches above computed
  // (prev/next roster from those branches, if any, is left as-is; only
  // where "back" points changes) so a recruiter who clicked in from My
  // Desk lands back on that same box instead of the firm-wide /candidates
  // list. Mandate-tied tasks deliberately don't use this -- they already
  // send "back" to the mandate itself via mandateId, which is where that
  // work actually lives.
  const INBOX_BOX_LABEL: Record<string, string> = {
    mandate: "Mandate Tasks",
    pipeline: "Build Pipeline",
    profiles: "Profile Completion",
  };
  if (back === "inbox") {
    const boxKey = box && INBOX_BOX_LABEL[box] ? box : "mandate";
    backHref = `/inbox?box=${boxKey}`;
    backLabel = `← My Desk — ${INBOX_BOX_LABEL[boxKey]}`;
  }

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

  const { data: verifiedFacts } = await supabase
    .from("candidate_verified_facts")
    .select("id, fact_type, note, created_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: false });

  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("id, at, action, detail")
    .eq("entity", "candidate")
    .eq("entity_id", id)
    .order("at", { ascending: false });

  const { data: activityRows } = await supabase
    .from("activities")
    .select("id, actor_id, kind, body, created_at, profiles(full_name)")
    .eq("entity_type", "candidate")
    .eq("entity_id", id)
    .order("created_at", { ascending: false });

  const activities = (activityRows ?? []).map((a) => ({
    id: a.id,
    actor_id: a.actor_id,
    kind: a.kind,
    body: a.body,
    created_at: a.created_at,
    actor_name: (a.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  })) as import("./activity-log-panel").Activity[];

  const { data: whatsappRows } = await supabase
    .from("whatsapp_messages")
    .select("id, direction, body_preview, status, created_at")
    .eq("candidate_id", id)
    .order("created_at", { ascending: true })
    .limit(50);

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, mandate_id, stage, in_shortlist, rejection_reason, stage_source, client_decision_at, rejected_from_stage, date_of_joining, mandates(client_name, role_title, city, cities)"
    )
    .eq("candidate_id", id);

  const linkedMandateCities = Array.from(
    new Set(
      (links ?? []).flatMap((l) => {
        const m = l.mandates as unknown as { city: string | null; cities: string[] | null } | null;
        return m?.cities?.length ? m.cities : m?.city ? [m.city] : [];
      })
    )
  );

  const { data: openMandates } = await supabase
    .from("mandates")
    .select("id, client_name, role_title")
    .eq("status", "open");

  // This candidate's answers to any mandate's custom Application Questions
  // (candidate-facing, answered on jobs.staffanchor.com Quick Apply -- see
  // application-questions-panel.tsx on the mandate page). Grouped by mandate
  // so MandateLinksPanel can show each link's answers inline instead of a
  // recruiter having to go dig through the mandate's own tab.
  const { data: applicationAnswerRows } = await supabase
    .from("mandate_application_answers")
    .select("mandate_id, answer_text, answer_number, answer_bool, mandate_screening_questions(question_text, answer_type)")
    .eq("candidate_id", id);
  const applicationAnswersByMandate: Record<
    string,
    { question_text: string; answer_type: string; answer_text: string | null; answer_number: number | null; answer_bool: boolean | null }[]
  > = {};
  (applicationAnswerRows ?? []).forEach((r) => {
    const q = r.mandate_screening_questions as unknown as { question_text: string; answer_type: string } | null;
    if (!q) return;
    (applicationAnswersByMandate[r.mandate_id] ??= []).push({
      question_text: q.question_text,
      answer_type: q.answer_type,
      answer_text: r.answer_text,
      answer_number: r.answer_number,
      answer_bool: r.answer_bool,
    });
  });

  const assessment = (candidate.recruiter_assessment ?? {}) as Record<string, unknown>;
  const segment = (candidate.segment_data ?? {}) as Record<string, unknown>;
  const selfAssessment = (candidate.self_assessment ?? {}) as Record<string, unknown>;

  const recommendation = (assessment.overall_recommendation as string | undefined) ?? undefined;
  const redFlags = (assessment.red_flags as string[] | undefined) ?? [];
  const scores = [
    { label: "Communication", value: assessment.communication_score as number | undefined },
    { label: "Confidence", value: assessment.confidence_score as number | undefined },
    { label: "Coachability", value: assessment.coachability_score as number | undefined },
  ].filter((s) => typeof s.value === "number");

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

  // Single place computing a neighbor's link so it always carries whichever
  // context (mandate / group / filtered list) got us to this page.
  function neighborHref(neighbor: { id: string } | null): string {
    if (!neighbor) return "#";
    if (mandateId) return `/candidates/${neighbor.id}?mandateId=${mandateId}`;
    if (groupId) return `/candidates/${neighbor.id}?groupId=${groupId}`;
    return `/candidates/${neighbor.id}?from=${encodeURIComponent(from ?? "")}`;
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors duration-200 ease-ros"
        >
          {backLabel}
        </Link>

        {listPosition && (
          <div className="flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400">
            <span className="tabular-nums mr-1">
              {listPosition.index} of {listPosition.total}
            </span>
            <Link
              href={neighborHref(prevCandidate)}
              aria-disabled={!prevCandidate}
              title={prevCandidate ? `Previous: ${prevCandidate.full_name}` : undefined}
              className={`flex items-center justify-center w-6 h-6 rounded-ros-md border border-slate-200 dark:border-slate-700 transition-all duration-200 ease-ros ${
                prevCandidate
                  ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] text-slate-600 dark:text-slate-400"
                  : "opacity-30 pointer-events-none text-slate-400"
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
            <Link
              href={neighborHref(nextCandidate)}
              aria-disabled={!nextCandidate}
              title={nextCandidate ? `Next: ${nextCandidate.full_name}` : undefined}
              className={`flex items-center justify-center w-6 h-6 rounded-ros-md border border-slate-200 dark:border-slate-700 transition-all duration-200 ease-ros ${
                nextCandidate
                  ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:-translate-y-px active:translate-y-0 active:scale-[0.98] text-slate-600 dark:text-slate-400"
                  : "opacity-30 pointer-events-none text-slate-400"
              }`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* --- Executive summary header --- */}
      <Card className="mt-2" padded={false}>
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-ros-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/60 flex items-center justify-center text-lg font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                {initialsFor(candidate.full_name)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[19px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{candidate.full_name}</h1>
                  {candidate.candidate_number != null && (
                    <span
                      className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400"
                      title="Candidate number — reference this in internal discussions"
                    >
                      C-{String(candidate.candidate_number).padStart(6, "0")}
                    </span>
                  )}
                  {recommendation && (
                    <Badge tone={RECOMMENDATION_TONE[recommendation] ?? "neutral"} size="sm">
                      {recommendation}
                    </Badge>
                  )}
                </div>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {candidate.current_job_title}
                  {candidate.current_employer ? ` at ${candidate.current_employer}` : ""}
                  {candidate.current_industry ? ` · ${candidate.current_industry}` : ""}
                </p>
                {(() => {
                  const former = ((candidate.industries as string[] | null) ?? []).filter(
                    (i) => i !== candidate.current_industry
                  );
                  if (former.length === 0) return null;
                  const MAX_SHOWN = 4;
                  const shown = former.slice(0, MAX_SHOWN);
                  const overflow = former.length - shown.length;
                  return (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="text-[11px] text-slate-400 mr-0.5">Previously:</span>
                      {shown.map((i) => (
                        <Badge key={i} tone="neutral" size="sm" className="normal-case tracking-normal">
                          {i}
                        </Badge>
                      ))}
                      {overflow > 0 && (
                        <span
                          className="text-[11px] text-slate-400"
                          title={former.slice(MAX_SHOWN).join(", ")}
                        >
                          +{overflow} more
                        </span>
                      )}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-[12px] text-slate-500 dark:text-slate-400">
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
              <EditProfileButton candidate={candidate} resumeSignedUrl={resumeSignedUrl} resumeFileName={resumeFileName} />
              <StatusControl candidateId={candidate.id} currentStatus={candidate.status} />
              <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.full_name} />
            </div>
          </div>

          {/* At-a-glance stat strip -- the handful of numbers a recruiter
              scans first (current location, experience, notice period,
              expected CTC), pulled out of the denser 8-field grid below and
              given their own prominent row right under the header, the way
              a portal candidate card leads with these before anything else. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <StatChip label="Current location" value={candidate.current_location} />
            <StatChip label="Experience" value={candidate.total_experience_years ? formatExperience(candidate.total_experience_years) : null} />
            <StatChip label="Days to join" value={candidate.notice_period} />
            <StatChip
              label="Expected fixed CTC"
              value={candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : null}
            />
          </div>

          {redFlags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-4">
              <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5" /> Risk flags:
              </span>
              {redFlags.map((flag) => (
                <Badge key={flag} tone="danger" size="sm" className="normal-case tracking-normal">
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <QuickContactActions candidateId={candidate.id} phone={candidate.phone} email={candidate.email} />
            {resumeSignedUrl && resumeFileName && (
              <ResumePreview signedUrl={resumeSignedUrl} fileName={resumeFileName} />
            )}
            {candidate.resume_file_url && !resumeSignedUrl && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-ros-md px-3 py-1.5">
                <FileText className="w-3 h-3" /> Resume file not found
              </span>
            )}
          </div>

          {/* Secondary details -- everything else, kept to the denser grid
              now that the four headline numbers above have their own row. */}
          <div className="grid grid-cols-4 gap-4 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800 text-[13px]">
            <Field label="Function / Domain" value={candidate.category?.replace("_", " ")} />
            <Field label="Primary sub-domain" value={candidate.sub_domain} />
            <Field label="Current fixed CTC" value={candidate.current_fixed_ctc ? `₹${candidate.current_fixed_ctc}L` : "—"} />
            <Field label="Current variable CTC" value={candidate.current_variable_ctc ? `₹${candidate.current_variable_ctc}L` : "—"} />
            <Field label="ESOPs held" value={candidate.esops_held ? "Yes" : "No"} />
          </div>

          {candidate.secondary_sub_domains?.length > 0 && (
            <div className="mt-4">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">Secondary sub-domains</p>
              <div className="flex flex-wrap gap-1.5">
                {candidate.secondary_sub_domains.map((tag: string) => (
                  <Badge key={tag} tone="neutral" size="sm" className="normal-case tracking-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* --- AI summary: front and center, not buried in a tab --- */}
      <Card className="mt-4">
        <AiSummaryPanel
          candidateId={candidate.id}
          initialSummary={candidate.ai_summary}
          initialPassport={candidate.ai_passport}
          initialDecisionFlags={candidate.ai_decision_flags}
          initialSkillInventory={candidate.skill_inventory}
          initialStabilityScore={candidate.stability_score}
        />
      </Card>

      {/* Durable, recruiter-confirmed facts about this candidate as a
          person (not tied to any one mandate) -- fed into future mandate
          matching (src/lib/candidate-match.ts) as a real signal, distinct
          from the per-mandate must-have checklist. Sits right under the AI
          summary since it directly shapes what that summary/matching sees. */}
      <Card className="mt-4">
        <VerifiedFactsPanel candidateId={candidate.id} initialFacts={verifiedFacts ?? []} />
      </Card>

      <div className="grid grid-cols-3 gap-6 mt-6">
        <div className="col-span-2">
          <Card>
            <Tabs
              tabs={[
                {
                  label: "Overview",
                  content: (
                    <div className="space-y-6">
                      {/* Current industry + previous industries already shown in the
                          header (line ~401, "Previously:" badges) -- not repeated here. */}
                      {candidate.skills && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-2">Skills</h3>
                          <div className="flex flex-wrap gap-1.5">
                            {candidate.skills.split(",").map((s: string) => s.trim()).filter(Boolean).map((skill: string) => (
                              <Badge key={skill} tone="accent" size="sm" className="normal-case tracking-normal">
                                {skill}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {segmentEntries.length > 0 && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-2">Sales profile</h3>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                            {segmentEntries.map(([k, v]) => (
                              <div key={k}>
                                <p className="text-[11px] text-slate-400">{humanize(k)}</p>
                                <p className="text-[13px] text-slate-700 dark:text-slate-300">{formatValue(v)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {Object.keys(selfAssessment).length > 0 && (
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-2">Self-reported write-ups</h3>
                          <div className="space-y-3">
                            {Object.entries(selfAssessment).map(([k, v]) => (
                              <div key={k}>
                                <p className="text-[11px] font-medium text-slate-400 uppercase">{humanize(k)}</p>
                                <p className="text-[13px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{String(v)}</p>
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
                  label: "Activity",
                  content: <ActivityLogPanel candidateId={candidate.id} activities={activities} />,
                },
                {
                  label: "WhatsApp",
                  content: (
                    <WhatsAppPanel
                      candidateId={candidate.id}
                      hasPhone={!!candidate.phone}
                      messages={(whatsappRows ?? []) as import("./whatsapp-panel").WhatsAppMessage[]}
                    />
                  ),
                },
                {
                  label: "Mandates",
                  content: (
                    <MandateLinksPanel
                      candidateId={candidate.id}
                      candidateName={candidate.full_name}
                      links={(links ?? []) as never}
                      openMandates={openMandates ?? []}
                      applicationAnswersByMandate={applicationAnswersByMandate}
                    />
                  ),
                },
                {
                  label: "Career",
                  content: (
                    <CareerTimelinePanel
                      candidateId={candidate.id}
                      currentEmployer={candidate.current_employer ?? null}
                      initialProfileEntries={(candidate.career_timeline_profile ?? []) as never}
                      initialResumeEntries={(candidate.career_timeline_resume ?? []) as never}
                      initialStabilityScore={candidate.stability_score ?? null}
                      initialDomainConsistencyScore={candidate.domain_consistency_score ?? null}
                    />
                  ),
                },
                {
                  label: "Timeline",
                  content: <Timeline events={timelineEvents} />,
                },
              ]}
            />
          </Card>
        </div>

        <div>
          <Card className="sticky top-20">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Recruiter assessment</h2>
              {recommendation && (
                <Badge tone={RECOMMENDATION_TONE[recommendation] ?? "neutral"} size="sm">
                  {recommendation}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
              Internal only, never shown to clients. Fill after a real call using the standard scorecard.
            </p>
            {scores.length > 0 && (
              <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                {scores.map((s) => (
                  <div key={s.label} className="text-center">
                    <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{s.value}<span className="text-[11px] font-normal text-slate-400">/5</span></p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
            <AssessmentForm
              candidateId={candidate.id}
              assessment={assessment}
              candidateLocation={candidate.current_location}
              linkedMandateCities={linkedMandateCities}
            />
            <MandateDiscussions entries={(candidate.mandate_discussion_summaries ?? []) as never} />
          </Card>

          {/* The recruiter's own structured, documented judgment call --
              deliberately separate from the AI-generated scoring above
              (stability_score / ai_decision_flags / talent_micro_index).
              This is the compounding vetting asset the business model is
              actually built on. */}
          <Card className="mt-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Vetting score</h2>
              {typeof candidate.vetting_score_overall === "number" && (
                <Badge tone="accent" size="sm">
                  {candidate.vetting_score_overall}/100
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
              Structured, per-criterion score -- the documented judgment behind why this candidate is worth
              presenting, not just a note buried in text.
            </p>
            <VettingScorePanel
              candidateId={candidate.id}
              initial={(candidate.vetting_score ?? {}) as never}
              scorerName={scorerName}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400">{label}</p>
      <p className="text-slate-800 dark:text-slate-200 font-medium">{value || "—"}</p>
    </div>
  );
}

// Portal-style headline stat -- bolder number, quieter label, its own
// bordered chip so these four read as the "at a glance" facts rather than
// blending into the denser field grid underneath.
function StatChip({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-ros-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-[10.5px] text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{value || "—"}</p>
    </div>
  );
}
