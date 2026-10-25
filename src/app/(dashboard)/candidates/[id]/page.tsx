import Link from "next/link";
import { after } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { FileText, AlertTriangle, ChevronLeft, ChevronRight, Briefcase, Clock, IndianRupee, Target, LayoutGrid, PhoneCall, Layers, MessageSquare, ScrollText, History as HistoryIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import AssessmentForm from "./assessment-form";
import MandateDiscussions from "./mandate-discussions";
import CareerTimelinePanel from "./career-timeline-panel";
import NotesPanel from "./notes-panel";
import ResumeMismatchesPanel from "./resume-mismatches-panel";
import StatusControl from "./status-control";
import MandateLinksPanel from "./mandate-links-panel";
import SuggestedRolesPanel from "./suggested-roles-panel";
import SaasPassportCard from "./saas-passport-card";
import { PASSPORT_COLUMNS, type PassportRow } from "@/lib/saas-passport";
import PracticeMatchesPanel from "./practice-matches-panel";
import Tabs from "./tabs";
import Timeline from "./timeline";
import AiSummaryPanel from "./ai-summary-panel";
import CallCompanion from "./call-companion";
import CvFactsPanel from "./cv-facts-panel";
import SendInviteButton from "./send-invite-button";
import AskMissingDetails from "./ask-missing-details";
import ProfileGroupControl from "./profile-group-control";
import AfterCallCard, { type PastDebrief } from "./after-call-card";
import BriefCard from "./brief-card";
import type { Brief } from "@/lib/candidate-brief";
import { POOL_PRACTICE, type PoolEntry, type PoolTier } from "@/lib/talent-pool";
import { missingKeyDetails } from "@/lib/key-details";
import { recordTiming } from "@/lib/page-timing";
import ResumePreview from "./resume-preview";
import SendRole from "./send-role";
import ActionCenter from "./action-center";
import TopTierStatus from "./top-tier-status";
import MessageHub from "./message-hub";
import TodoList from "./todo-list";
import GapChip from "./gap-chip";
import CopyButton from "./copy-button";
import InlineFact, { FactTile } from "./inline-fact";
import CallButton from "./call-button";
import CvActionsBar from "@/components/cv-actions-bar";
import { candidateNextActions, plain } from "@/lib/candidate-next-actions";
import DeleteCandidateButton from "./delete-candidate-button";
import EditProfileButton from "./edit-profile-button";
import { ProfileRatingPanel } from "@/components/profile-rating";
import ActivityLogPanel from "./activity-log-panel";
import WhatsAppPanel from "./whatsapp-panel";
import { formatExperience } from "@/lib/format-experience";
import { formatDateIST } from "@/lib/format-datetime";
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


function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; mandateId?: string; groupId?: string; back?: string; box?: string; calls_recruiter?: string }>;
}) {
  const { id } = await params;
  const { from, mandateId, groupId, back, box, calls_recruiter } = await searchParams;
  const supabase = await createClient();

  const { data: candidate } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", id)
    .single();

  if (!candidate) notFound();
  const renderStart = Date.now();
  const waDigits = String(candidate.phone ?? "").replace(/\D/g, "");
  const waPhoneKey = waDigits.length >= 10 ? waDigits.slice(-10) : "";

  // Everything below depends only on the candidate's id, so all of it starts at once instead of one query after another.
  // (A query builder only sends when awaited, so each is wrapped to start now and awaited where its result is used.)
  const q = {
    practices: Promise.resolve(supabase.from("practices").select("id, slug, name, group_name").order("sort_order", { ascending: true })),
    candPractices: Promise.resolve(supabase.from("candidate_practices").select("practice_id, seniority_band, is_primary, tagged_by").eq("candidate_id", id)),
    viewer: Promise.resolve(supabase.auth.getUser()).then(async ({ data: { user } }) => (user ? { user, profile: (await supabase.from("profiles").select("full_name, email").eq("id", user.id).single()).data } : { user: null, profile: null })),
    passport: Promise.resolve(supabase.from("saas_passport").select(PASSPORT_COLUMNS).eq("candidate_id", id).maybeSingle()),
    cvFacts: Promise.resolve(supabase.from("candidate_cv_facts").select("facts").eq("candidate_id", id).maybeSingle()),
    notes: Promise.resolve(supabase.from("recruiter_notes").select("id, note_type, content, created_at, author_id").eq("candidate_id", id).order("created_at", { ascending: false })),
    audit: Promise.resolve(supabase.from("audit_log").select("id, at, action, detail").eq("entity", "candidate").eq("entity_id", id).order("at", { ascending: false })),
    pool: Promise.resolve(supabase.from("talent_pool_entries").select("tier, reason, tags, marked_at").eq("candidate_id", id).eq("practice", POOL_PRACTICE).maybeSingle()),
    debriefs: Promise.resolve(supabase.from("candidate_debriefs").select("id, created_at, raw_note, structured, profiles(full_name)").eq("candidate_id", id).order("created_at", { ascending: false }).limit(5)),
    brief: Promise.resolve(supabase.from("candidate_briefs").select("brief, source, generated_at").eq("candidate_id", id).maybeSingle()),
    activities: Promise.resolve(supabase.from("activities").select("id, actor_id, kind, body, created_at, profiles(full_name)").eq("entity_type", "candidate").eq("entity_id", id).order("created_at", { ascending: false })),
    // Messages sent before the profile existed (the bot's onboarding questions) carry no candidate_id, so the chat is matched on
    // the phone's last 10 digits as well. to_phone holds the number with or without the 91 prefix.
    whatsapp: Promise.resolve(
      supabase
        .from("whatsapp_messages")
        .select("id, direction, body_preview, status, created_at")
        .or(waPhoneKey ? `candidate_id.eq.${id},to_phone.like.%${waPhoneKey}` : `candidate_id.eq.${id}`)
        .order("created_at", { ascending: false })
        .limit(50),
    ),
    links: Promise.resolve(
      supabase
        .from("candidate_mandate_links")
        .select("id, mandate_id, stage, in_shortlist, rejection_reason, rejection_category, stage_source, client_decision_at, rejected_from_stage, date_of_joining, mandates(client_name, role_title, city, cities)")
        .eq("candidate_id", id)
    ),
    openMandates: Promise.resolve(supabase.from("mandates").select("id, client_name, role_title, practice_id, seniority_band").eq("status", "open").eq("is_archived", false)),
    answers: Promise.resolve(supabase.from("mandate_application_answers").select("mandate_id, answer_text, answer_number, answer_bool, mandate_screening_questions(question_text, answer_type)").eq("candidate_id", id)),
    signed: candidate.resume_file_url
      ? Promise.resolve(supabase.storage.from("resumes").createSignedUrl((candidate.resume_file_url as string).replace(/^resumes\//, ""), 60 * 60 * 12))
      : Promise.resolve(null),
    mandateCtx: mandateId ? Promise.resolve(supabase.from("mandates").select("role_title, client_name").eq("id", mandateId).single()) : Promise.resolve(null),
    mandateRoster: mandateId ? Promise.resolve(supabase.from("candidate_mandate_links").select("candidate_id, created_at, candidates(id, full_name)").eq("mandate_id", mandateId).order("created_at", { ascending: true })) : Promise.resolve(null),
    groupCtx: !mandateId && groupId ? Promise.resolve(supabase.from("candidate_groups").select("name").eq("id", groupId).single()) : Promise.resolve(null),
    groupRoster: !mandateId && groupId ? Promise.resolve(supabase.from("candidate_group_members").select("candidate_id, added_at, candidates(id, full_name)").eq("group_id", groupId).order("added_at", { ascending: true })) : Promise.resolve(null),
  };

  const { data: allPracticesRows } = await q.practices;
  const { data: candidatePracticeRows } = await q.candPractices;

  // Attributed to whoever actually saves the vetting score (vetting-score-panel.tsx),
  // same "who did this, not who owns the record" principle as profile_completed_by.
  const { user: viewerUser, profile: viewerProfile } = await q.viewer;
  void viewerUser;
  const scorerName = viewerProfile?.full_name ?? viewerProfile?.email ?? "Unknown";

  // Things worth asking on a call: the AI's watch-areas plus any honesty or gap
  // flags raised when the CV was read.
  const { data: passportRow } = await q.passport;
  const { data: cvFactsRow } = await q.cvFacts;
  const cvFlagDetails = (((cvFactsRow?.facts as { flags?: { detail?: string }[] } | null)?.flags ?? []) as { detail?: string }[])
    .map((f) => f?.detail)
    .filter((d): d is string => typeof d === "string" && d.trim().length > 0);
  const watchAreas = (((candidate.ai_decision_flags as { watch_areas?: string[] } | null)?.watch_areas ?? []) as string[]).filter(
    (d) => typeof d === "string" && d.trim().length > 0
  );
  const callDoubts = Array.from(new Set([...watchAreas, ...cvFlagDetails])).slice(0, 8);

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
    // Runs after the page is sent, so opening a profile never waits on the AI; the refreshed summary shows on the next view.
    const candidateId = candidate.id;
    after(async () => {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) return;
      const admin = createSupabaseClient(url, key, { auth: { persistSession: false } });
      await generateAiPassportForCandidate(candidateId, admin, { note: "auto_regenerated_on_view_after_assessment" }).catch(() => {});
    });
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
    const { data: mandateRow } = (await q.mandateCtx) ?? { data: null };
    backHref = `/mandates/${mandateId}`;
    backLabel = mandateRow ? `← ${mandateRow.role_title} — ${mandateRow.client_name}` : "← Back to mandate";

    const { data: mandateLinkRows } = (await q.mandateRoster) ?? { data: null };
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
    const { data: groupRow } = (await q.groupCtx) ?? { data: null };
    backHref = `/candidates/groups/${groupId}`;
    backLabel = groupRow ? `← ${groupRow.name}` : "← Back to group";

    const { data: groupMemberRows } = (await q.groupRoster) ?? { data: null };
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

  // Opened from the header bell, the admin Team Calls panel, or the
  // /calls-flagged table itself -- "back" should return to that table
  // (same scope: self, or a specific teammate's queue via
  // calls_recruiter when an admin opened it from Team Calls), not to the
  // mandate the call happens to be on. Deliberately checked after the
  // mandateId branch above so it always wins when both are present --
  // every one of these links also carries mandateId (prev/next still
  // needs it), but back=calls is the more specific signal of where the
  // click actually came from.
  if (back === "calls") {
    backHref = calls_recruiter ? `/calls-flagged?recruiter=${calls_recruiter}` : "/calls-flagged";
    backLabel = "← Calls flagged";
  }

  let resumeSignedUrl: string | null = null;
  let resumeFileName: string | null = null;
  if (candidate.resume_file_url) {
    // Data has been inconsistent historically -- some rows store the path
    // with a leading "resumes/" bucket-name prefix, some without. Strip it
    // so we always pass a path relative to the bucket itself.
    const rawPath = candidate.resume_file_url as string;
    const cleanPath = rawPath.replace(/^resumes\//, "");
    const signedResult = (await q.signed) as { data: { signedUrl: string } | null; error: unknown } | null;
    const signed = signedResult?.data ?? null;
    const signError = signedResult?.error ?? null;
    if (!signError && signed) {
      resumeSignedUrl = signed.signedUrl;
      resumeFileName = cleanPath.split("/").pop() ?? cleanPath;
    }
  }

  const { data: notes } = await q.notes;

  const { data: auditRows } = await q.audit;

  const { data: poolRaw } = await q.pool;
  const poolEntry: PoolEntry | null = poolRaw ? { tier: poolRaw.tier as PoolTier, reason: poolRaw.reason, tags: (poolRaw.tags as string[] | null) ?? [], marked_at: poolRaw.marked_at } : null;

  const { data: debriefRows } = await q.debriefs;
  const pastDebriefs: PastDebrief[] = ((debriefRows ?? []) as unknown as { id: string; created_at: string; raw_note: string; structured: { summary?: string } | null; profiles: { full_name: string | null } | { full_name: string | null }[] | null }[]).map((d) => ({
    id: d.id,
    created_at: d.created_at,
    raw_note: d.raw_note,
    summary: d.structured?.summary ?? null,
    author: (Array.isArray(d.profiles) ? d.profiles[0]?.full_name : d.profiles?.full_name) ?? null,
  }));
  const { data: briefRow } = await q.brief;

  const { data: activityRows } = await q.activities;

  const activities = (activityRows ?? []).map((a) => ({
    id: a.id,
    actor_id: a.actor_id,
    kind: a.kind,
    body: a.body,
    created_at: a.created_at,
    actor_name: (a.profiles as unknown as { full_name: string | null } | null)?.full_name ?? null,
  })) as import("./activity-log-panel").Activity[];

  // Newest 50 are fetched so a long chat keeps its latest messages; the panel reads oldest first.
  const whatsappRows = ((await q.whatsapp).data ?? []).slice().reverse();

  const { data: links } = await q.links;

  const linkedMandateCities = Array.from(
    new Set(
      (links ?? []).flatMap((l) => {
        const m = l.mandates as unknown as { city: string | null; cities: string[] | null } | null;
        return m?.cities?.length ? m.cities : m?.city ? [m.city] : [];
      })
    )
  );

  const { data: openMandates } = await q.openMandates;

  // Same "already linked, don't resurface" exclusion the pool-wide
  // /practice-pool page uses -- this candidate's own `links` (fetched
  // above) already covers it, just needs to be a Set for the matcher.
  const alreadyLinkedMandateIds = new Set((links ?? []).map((l) => l.mandate_id));

  // This candidate's answers to any mandate's custom Application Questions
  // (candidate-facing, answered on jobs.staffanchor.com Quick Apply -- see
  // application-questions-panel.tsx on the mandate page). Grouped by mandate
  // so MandateLinksPanel can show each link's answers inline instead of a
  // recruiter having to go dig through the mandate's own tab.
  const { data: applicationAnswerRows } = await q.answers;
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

  recordTiming("candidate", renderStart);
  const activeLinks = (links ?? []).filter((l) => !["rejected", "pulled_back"].includes(l.stage));
  // One function decides the verdict and the to-do list (see lib/candidate-next-actions).
  const confirmedAt = ((candidate.details_confirmed_at as string | null | undefined) ?? (candidate.segment_data as { call_confirmed?: { at?: string } } | null)?.call_confirmed?.at) ?? null;
  const next = candidateNextActions({
    email: candidate.email,
    current_job_title: candidate.current_job_title,
    current_employer: candidate.current_employer,
    total_experience_years: candidate.total_experience_years,
    current_fixed_ctc: candidate.current_fixed_ctc,
    expected_fixed_ctc: candidate.expected_fixed_ctc,
    notice_period: candidate.notice_period,
    current_location: candidate.current_location,
    resume_file_url: candidate.resume_file_url,
    phone: candidate.phone,
    phone_hold: (candidate as { phone_hold?: boolean }).phone_hold ?? false,
    recommendation: recommendation ?? null,
    confirmedDaysAgo: confirmedAt ? daysAgo(confirmedAt) : null,
    activeRoleCount: activeLinks.length,
    callNoteCount: pastDebriefs.length,
  });
  const todos = next.todos;
  const detailsTotal = 8;
  const detailsDone = detailsTotal - missingKeyDetails(candidate).length;
  const lastTouch = [...activities.map((a: { created_at?: string }) => a.created_at), ...((whatsappRows ?? []) as { created_at?: string }[]).map((m) => m.created_at)].filter(Boolean).sort().pop();
  const lastContactDays = lastTouch ? daysAgo(lastTouch as string) : null;
  const VERDICT_BAR = { ready: "bg-emerald-500", needs_details: "bg-amber-400", on_hold: "bg-rose-500", not_a_fit: "bg-slate-400" } as const;
  const AVATARS = ["bg-teal-100 text-teal-800", "bg-violet-100 text-violet-800", "bg-sky-100 text-sky-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-emerald-100 text-emerald-800"];
  const avatarTone = AVATARS[Array.from(String(candidate.full_name ?? "?")).reduce<number>((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % AVATARS.length];
  const VERDICT_TONE = {
    ready: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
    needs_details: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
    on_hold: "bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900",
    not_a_fit: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
  } as const;
  const { data: bestMatchRow } = await supabase.from("mandate_ai_matches").select("score, mandates(role_title, client_name)").eq("candidate_id", candidate.id).in("fit", ["strong", "possible"]).order("score", { ascending: false }).limit(1).maybeSingle();
  const bestMatch = bestMatchRow ? `${(bestMatchRow as unknown as { mandates?: { role_title?: string } | null }).mandates?.role_title ?? "Role"} · ${(bestMatchRow as { score: number }).score}` : null;
  const suggestMissing = next.missing.length > 0;
  const hubSuggestion = suggestMissing ? `Ask for ${next.missing.map((m) => plain(m.label)).join(", ")}. The official WhatsApp tab does it in one click.` : todos.some((t) => t.fix === "get_cv") ? "Ask for their CV by email." : null;

  const tabs = [
    {
      label: "Overview",
      icon: <LayoutGrid className="h-4 w-4" />,
      tone: "teal" as const,
      content: (
        <div className="space-y-5">
          <BriefCard
            candidateId={candidate.id}
            brief={(briefRow?.brief as Brief | undefined) ?? null}
            generatedAt={briefRow?.generated_at ?? null}
            fromCall={briefRow?.source === "cv+call"}
            name={candidate.full_name}
            employer={candidate.current_employer}
          />
          <AiSummaryPanel
            candidateId={candidate.id}
            initialSummary={candidate.ai_summary}
            initialPassport={candidate.ai_passport}
            initialDecisionFlags={candidate.ai_decision_flags}
            initialSkillInventory={candidate.skill_inventory}
            initialStabilityScore={candidate.stability_score}
            nextQuestions={callDoubts}
          />
          {candidate.skills && !candidate.skill_inventory && (
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
                    <p className="text-xs text-slate-400">{humanize(k)}</p>
                    <p className="text-[13px] text-slate-700 dark:text-slate-300">{formatValue(v)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {Object.keys(selfAssessment).length > 0 && (
            <div>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 mb-2">In their own words</h3>
              <div className="space-y-3">
                {Object.entries(selfAssessment).map(([k, v]) => (
                  <div key={k}>
                    <p className="text-xs font-medium text-slate-400 uppercase">{humanize(k)}</p>
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
      label: "Calls & notes",
      icon: <PhoneCall className="h-4 w-4" />,
      tone: "violet" as const,
      content: (
        <div className="space-y-6">
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            Everything about a call lives here, in order: tap answers <b>during</b> the call, write a note <b>after</b> it, then optionally score them.
          </p>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">1. During the call</h3>
            <CallCompanion candidate={candidate as never} doubts={callDoubts} recruiterName={scorerName} />
          </section>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">2. After the call</h3>
            <AfterCallCard candidateId={candidate.id} history={pastDebriefs} />
          </section>
          <details className="rounded-ros-lg border border-slate-200 p-4 dark:border-slate-700" open={!!recommendation}>
            <summary className="cursor-pointer text-[13px] font-semibold text-slate-900 dark:text-slate-100">
              3. Scorecard <span className="font-normal text-slate-500">(optional, internal only)</span>
              {recommendation ? <span className="ml-2"><Badge tone={RECOMMENDATION_TONE[recommendation] ?? "neutral"} size="sm">{recommendation}</Badge></span> : null}
            </summary>
            <div className="mt-3">
              {scores.length > 0 && (
                <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  {scores.map((s) => (
                    <div key={s.label} className="text-center">
                      <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{s.value}<span className="text-xs font-normal text-slate-400">/5</span></p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
              <AssessmentForm candidateId={candidate.id} assessment={assessment} candidateLocation={candidate.current_location} linkedMandateCities={linkedMandateCities} />
              <MandateDiscussions entries={(candidate.mandate_discussion_summaries ?? []) as never} />
            </div>
          </details>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Notes</h3>
            <NotesPanel candidateId={candidate.id} notes={notes ?? []} />
          </section>
        </div>
      ),
    },
    {
      label: "Roles",
      icon: <Layers className="h-4 w-4" />,
      tone: "sky" as const,
      content: (
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">On these roles</h3>
            <MandateLinksPanel
              candidateId={candidate.id}
              candidateName={candidate.full_name}
              links={(links ?? []) as never}
              openMandates={openMandates ?? []}
              applicationAnswersByMandate={applicationAnswersByMandate}
            />
          </section>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Roles that could fit</h3>
            <SuggestedRolesPanel candidateId={candidate.id} hasCv={!!candidate.resume_file_url} />
          </section>
          <section>
            <h3 className="mb-1 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Other open roles in their practice</h3>
            <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Based on their practice tags (Overview tab).</p>
            <PracticeMatchesPanel
              candidateId={candidate.id}
              candidatePractices={(candidatePracticeRows ?? []) as never}
              allPractices={(allPracticesRows ?? []) as never}
              mandates={(openMandates ?? []) as never}
              alreadyLinkedMandateIds={alreadyLinkedMandateIds}
            />
          </section>
        </div>
      ),
    },
    {
      label: "Messages",
      icon: <MessageSquare className="h-4 w-4" />,
      tone: "emerald" as const,
      content: <WhatsAppPanel candidateId={candidate.id} hasPhone={!!candidate.phone} messages={(whatsappRows ?? []) as import("./whatsapp-panel").WhatsAppMessage[]} />,
    },
    {
      label: "CV & career",
      icon: <ScrollText className="h-4 w-4" />,
      tone: "amber" as const,
      content: (
        <div className="space-y-6">
          <CvFactsPanel candidateId={candidate.id} />
          {passportRow ? <SaasPassportCard row={passportRow as unknown as PassportRow} /> : null}
          {candidate.resume_mismatches && candidate.resume_mismatches.length > 0 && <ResumeMismatchesPanel candidateId={candidate.id} mismatches={candidate.resume_mismatches} />}
          <ProfileRatingPanel candidateId={candidate.id} />
          <CareerTimelinePanel
            candidateId={candidate.id}
            currentEmployer={candidate.current_employer ?? null}
            initialProfileEntries={(candidate.career_timeline_profile ?? []) as never}
            initialResumeEntries={(candidate.career_timeline_resume ?? []) as never}
            initialStabilityScore={candidate.stability_score ?? null}
            initialDomainConsistencyScore={candidate.domain_consistency_score ?? null}
          />
        </div>
      ),
    },
    {
      label: "History",
      icon: <HistoryIcon className="h-4 w-4" />,
      tone: "slate" as const,
      content: (
        <div className="space-y-6">
          <Timeline events={timelineEvents} />
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Contact attempts</h3>
            <ActivityLogPanel candidateId={candidate.id} activities={activities} />
          </section>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-[1180px] mx-auto px-5 py-8">
      <div className="flex items-center justify-between">
        <Link href={backHref} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors duration-200 ease-ros">
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
              className={`flex items-center justify-center w-6 h-6 rounded-ros-md border border-slate-200 dark:border-slate-700 ${prevCandidate ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400" : "opacity-30 pointer-events-none text-slate-400"}`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Link>
            <Link
              href={neighborHref(nextCandidate)}
              aria-disabled={!nextCandidate}
              title={nextCandidate ? `Next: ${nextCandidate.full_name}` : undefined}
              className={`flex items-center justify-center w-6 h-6 rounded-ros-md border border-slate-200 dark:border-slate-700 ${nextCandidate ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400" : "opacity-30 pointer-events-none text-slate-400"}`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>

      {/* 1. Who this is, the verdict, and four facts */}
      <Card className="mt-3 overflow-hidden" padded={false}>
        <div className={`h-1.5 ${VERDICT_BAR[next.verdict]}`} aria-hidden />
        <div className="p-6">
          <div className="flex items-start justify-between gap-5">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className={`w-12 h-12 rounded-ros-full ${avatarTone} flex items-center justify-center text-base font-semibold shrink-0`}>
                {initialsFor(candidate.full_name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h1 className="text-[22px] leading-7 font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{candidate.full_name}</h1>
                  {candidate.candidate_number != null && (
                    <span className="text-xs font-mono text-slate-400" title="Candidate number">
                      C-{String(candidate.candidate_number).padStart(6, "0")}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1 ${VERDICT_TONE[next.verdict]}`} title={next.reason}>
                    {next.verdict === "ready" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {next.verdictLabel}
                  </span>
                </div>
                <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-0.5">
                  {candidate.current_job_title}
                  {candidate.current_employer ? ` at ${candidate.current_employer}` : ""}
                  {candidate.current_location ? ` · ${candidate.current_location}` : ""}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500 dark:text-slate-400">
                  {!/\.invalid$/i.test(candidate.email ?? "") && candidate.email ? (
                    <span className="inline-flex items-center gap-1">
                      {candidate.email}
                      <CopyButton text={candidate.email} label="email" />
                    </span>
                  ) : (
                    <span>No email yet</span>
                  )}
                  {candidate.phone && (
                    <span className="inline-flex items-center gap-1">
                      {candidate.phone}
                      <CopyButton text={String(candidate.phone)} label="phone number" />
                    </span>
                  )}
                  {Array.isArray(candidate.alt_phones) && candidate.alt_phones.length > 0 && <span>alt {candidate.alt_phones.join(", ")}</span>}
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <EditProfileButton candidate={candidate} resumeSignedUrl={resumeSignedUrl} resumeFileName={resumeFileName} />
                <StatusControl candidateId={candidate.id} currentStatus={candidate.status} />
              </div>
              <div className="text-right text-[12px] text-slate-500 dark:text-slate-400">
                <p className="flex items-center justify-end gap-2">
                  <span>{detailsDone} of {detailsTotal} key details</span>
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden>
                    <span className={`block h-full rounded-full ${detailsDone === detailsTotal ? "bg-emerald-500" : "bg-amber-400"}`} style={{ width: `${(detailsDone / detailsTotal) * 100}%` }} />
                  </span>
                </p>
                <p className="mt-0.5">{lastContactDays == null ? "No contact logged yet" : lastContactDays === 0 ? "Last contact today" : `Last contact ${lastContactDays}d ago`}</p>
              </div>
            </div>
          </div>

          

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <FactTile label="Experience" icon={<Briefcase className="h-4 w-4" />} tone="sky">
              <p className="mt-0.5 text-[16px] font-semibold text-slate-900 dark:text-slate-100">{candidate.total_experience_years ? formatExperience(candidate.total_experience_years) : <GapChip label="Add it" />}</p>
            </FactTile>
            <InlineFact candidateId={candidate.id} label="Notice period" tone="violet" icon={<Clock className="h-4 w-4" />} display={candidate.notice_period || null} fields={[{ key: "notice_period", label: "Notice period", kind: "text", value: candidate.notice_period ?? null }]} />
            <InlineFact
              candidateId={candidate.id}
              label="Fixed CTC, now → expected"
              tone="emerald"
              icon={<IndianRupee className="h-4 w-4" />}
              display={candidate.current_fixed_ctc || candidate.expected_fixed_ctc ? `${candidate.current_fixed_ctc ? `₹${candidate.current_fixed_ctc}L` : "?"} → ${candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : "?"}` : null}
              fields={[
                { key: "current_fixed_ctc", label: "Now", kind: "lakhs", value: candidate.current_fixed_ctc ?? null },
                { key: "expected_fixed_ctc", label: "Expected", kind: "lakhs", value: candidate.expected_fixed_ctc ?? null },
              ]}
            />
            <FactTile label="Best matching role" icon={<Target className="h-4 w-4" />} tone="teal">
              <p className="mt-0.5 text-[16px] font-semibold leading-5 text-slate-900 dark:text-slate-100" title={bestMatch ?? undefined}>{bestMatch ?? <span className="text-[14px] font-normal text-slate-400">No match yet</span>}</p>
            </FactTile>
          </div>

          {redFlags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-3">
              <span className="flex items-center gap-1 text-xs font-medium text-rose-600">
                <AlertTriangle className="w-3.5 h-3.5" /> Watch out:
              </span>
              {redFlags.map((flag) => (
                <Badge key={flag} tone="danger" size="sm" className="normal-case tracking-normal">
                  {flag}
                </Badge>
              ))}
            </div>
          )}

          {/* 2. Four buttons, always in the same place */}
          <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
            <ActionCenter
              message={
                <MessageHub
                  candidateId={candidate.id}
                  candidateName={candidate.full_name}
                  phone={candidate.phone}
                  email={candidate.email}
                  missingKeys={missingKeyDetails(candidate).map((m) => m.key)}
                  suggestion={hubSuggestion}
                  suggestedTab={suggestMissing && candidate.phone ? "official" : "email"}
                  emailSlot={
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <SendInviteButton candidateId={candidate.id} />
                        <span className="text-[12px] text-slate-500">Emails them a link to complete their own profile.</span>
                      </div>
                      <SendRole candidateId={candidate.id} candidateName={candidate.full_name} email={candidate.email} roles={(openMandates ?? []) as never} channel="email" inline />
                    </div>
                  }
                  officialSlot={
                    <div className="space-y-3">
                      <AskMissingDetails candidateId={candidate.id} missing={next.missing.map((m) => m.label)} />
                      <SendRole candidateId={candidate.id} candidateName={candidate.full_name} email={candidate.email} roles={(openMandates ?? []) as never} channel="whatsapp" inline />
                    </div>
                  }
                />
              }
              label={
                <div className="space-y-5">
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold text-slate-900 dark:text-slate-100">Category</h3>
                    <ProfileGroupControl
                      candidateId={candidate.id}
                      group={candidate.profile_group ?? null}
                      subgroup={candidate.profile_subgroup ?? null}
                      also={candidate.profile_group_also ?? null}
                      reason={candidate.profile_group_reason ?? null}
                      needsReview={!!candidate.profile_group_needs_review}
                      locked={!!candidate.profile_group_locked}
                    />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Role and quality</h3>
                    <div className="-mx-4 mt-1">
                      <CvActionsBar candidateId={candidate.id} showCategory={false} />
                    </div>
                  </div>
                </div>
              }
            >
              <CallButton candidateId={candidate.id} phone={candidate.phone} />
              {resumeSignedUrl && resumeFileName && <ResumePreview signedUrl={resumeSignedUrl} fileName={resumeFileName} label="CV" candidateId={candidate.id} />}
              {candidate.resume_file_url && !resumeSignedUrl && (
                <span className="flex items-center gap-1.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-ros-md px-3 py-1.5">
                  <FileText className="w-3 h-3" /> Resume file not found
                </span>
              )}
            </ActionCenter>
            <TopTierStatus
              candidateId={candidate.id}
              isSales={candidate.profile_group === "b2b_sales" || candidate.profile_group === "b2c_sales"}
              ready={candidate.readiness_tier === "ready"}
              openAt={(candidate.open_to_work_at as string | null | undefined) ?? null}
              notNowUntil={(candidate.not_now_until as string | null | undefined) ?? null}
              missingCount={missingKeyDetails(candidate).length}
              nowMs={renderStart}
            />
          </div>
        </div>
      </Card>

      {/* 3. What to do next, and why it matters */}
      <Card className="mt-4">
        <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">To do{todos.length ? ` (${todos.length})` : ""}</h2>
        {todos.length === 0 ? (
          <p className="mt-2 text-[13px] text-emerald-700 dark:text-emerald-300">Nothing pending. This profile is ready to put forward.</p>
        ) : (
          <TodoList todos={todos} />
        )}
      </Card>

      {/* 4. Everything else, grouped */}
      <Card className="mt-4">
        <Tabs tabs={tabs} />
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3 text-[12px] text-slate-400">
        <span>
          Registered {candidate.created_at ? formatDateIST(candidate.created_at) : "—"}
          {candidate.acquisition_source ? ` · from ${[candidate.acquisition_source, candidate.acquisition_campaign].filter(Boolean).join(" · ")}` : ""}
        </span>
        <DeleteCandidateButton candidateId={candidate.id} candidateName={candidate.full_name} />
      </div>
    </div>
  );
}


// Portal-style headline stat -- bolder number, quieter label, its own
// bordered chip so these four read as the "at a glance" facts rather than
// blending into the denser field grid underneath.
