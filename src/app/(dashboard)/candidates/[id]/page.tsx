import Link from "next/link";
import { after } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText, AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import AssessmentForm from "./assessment-form";
import PracticeTagsPanel from "./practice-tags-panel";
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
import PoolControl from "@/components/pool-control";
import AfterCallCard, { type PastDebrief } from "./after-call-card";
import BriefCard from "./brief-card";
import type { Brief } from "@/lib/candidate-brief";
import { POOL_PRACTICE, type PoolEntry, type PoolTier } from "@/lib/talent-pool";
import { missingKeyDetails } from "@/lib/key-details";
import { recordTiming } from "@/lib/page-timing";
import ResumePreview from "./resume-preview";
import SendRole from "./send-role";
import DeleteCandidateButton from "./delete-candidate-button";
import EditProfileButton from "./edit-profile-button";
import QuickContactActions from "./quick-contact-actions";
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
  const missingNow = missingKeyDetails(candidate);
  const activeLinks = (links ?? []).filter((l) => !["rejected", "pulled_back"].includes(l.stage));
  // What still needs doing for this person, each with why it matters. One list replaces the old banner, checklist and risk strip.
  const confirmedAt = ((candidate.details_confirmed_at as string | null | undefined) ?? (candidate.segment_data as { call_confirmed?: { at?: string } } | null)?.call_confirmed?.at) ?? null;
  const confirmedDays = confirmedAt ? daysAgo(confirmedAt) : null;
  const todos: { text: string; impact: string; urgent?: boolean; ask?: boolean }[] = [];
  if ((candidate as { phone_hold?: boolean }).phone_hold) todos.push({ text: "Confirm their phone number", impact: "It is on hold, so no WhatsApp or call can go out until it is confirmed.", urgent: true });
  if (missingNow.length > 0) todos.push({ text: `Get ${missingNow.map((m) => m.label.toLowerCase()).join(", ")}`, impact: "A profile without these cannot go to a client, and role matching is weaker.", urgent: true, ask: true });
  if (!candidate.resume_file_url) todos.push({ text: "Get their CV", impact: "The summary, CV facts and role matching are all read from the CV." });
  if (confirmedDays == null || confirmedDays > 60) todos.push({ text: "Confirm CTC and notice period on a call", impact: confirmedDays == null ? "They have never confirmed their own details. Clients expect verified numbers." : `Last confirmed ${confirmedDays} days ago. Numbers go stale.` });
  if (activeLinks.length === 0) todos.push({ text: "Put them on a role", impact: "Not on any role yet, so nothing is moving. See the Roles tab for suggestions." });
  if (pastDebriefs.length === 0 && !recommendation) todos.push({ text: "Record a call note after you speak", impact: "It writes the brief clients see and sharpens future matches." });

  const tabs = [
    {
      label: "Overview",
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
          {/* One place for everything the system read about this person: the AI's verdict first, the facts it rests on straight under it. */}
          <section className="rounded-ros-lg border border-slate-200 dark:border-slate-700">
            <div className="p-4">
              <AiSummaryPanel
                candidateId={candidate.id}
                initialSummary={candidate.ai_summary}
                initialPassport={candidate.ai_passport}
                initialDecisionFlags={candidate.ai_decision_flags}
                initialSkillInventory={candidate.skill_inventory}
                initialStabilityScore={candidate.stability_score}
              />
            </div>
            <div className="border-t border-slate-100 p-4 dark:border-slate-800">
              <CvFactsPanel candidateId={candidate.id} />
            </div>
            {passportRow ? (
              <div className="border-t border-slate-100 p-4 dark:border-slate-800">
                <SaasPassportCard row={passportRow as unknown as PassportRow} />
              </div>
            ) : null}
          </section>
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
          <details className="rounded-ros-lg border border-slate-200 p-4 dark:border-slate-700">
            <summary className="cursor-pointer text-[13px] font-semibold text-slate-900 dark:text-slate-100">Group, practices and tags</summary>
            <div className="mt-3">
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
            <p className="mt-3 mb-3 text-xs text-slate-500 dark:text-slate-400">A candidate can belong to more than one practice, each with its own seniority band.</p>
            <PracticeTagsPanel candidateId={candidate.id} allPractices={(allPracticesRows ?? []) as never} initial={(candidatePracticeRows ?? []) as never} />
          </details>
        </div>
      ),
    },
    {
      label: "Calls & notes",
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
      content: <WhatsAppPanel candidateId={candidate.id} hasPhone={!!candidate.phone} messages={(whatsappRows ?? []) as import("./whatsapp-panel").WhatsAppMessage[]} />,
    },
    {
      label: "CV & career",
      content: (
        <div className="space-y-6">
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
    <div className="max-w-[1100px] mx-auto px-5 py-8">
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

      {/* 1. Who this is, in four facts */}
      <Card className="mt-3" padded={false}>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-12 h-12 rounded-ros-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/60 flex items-center justify-center text-base font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                {initialsFor(candidate.full_name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-[19px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">{candidate.full_name}</h1>
                  {candidate.candidate_number != null && (
                    <span className="inline-flex items-center rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-xs font-mono text-slate-500 dark:text-slate-400" title="Candidate number">
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
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] text-slate-500 dark:text-slate-400">
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" /> {/\.invalid$/i.test(candidate.email ?? "") ? "No email yet" : candidate.email}
                  </span>
                  {candidate.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {candidate.phone}
                    </span>
                  )}
                  {Array.isArray(candidate.alt_phones) && candidate.alt_phones.length > 0 && (
                    <span className="flex items-center gap-1" title="Alternate number (for example the WhatsApp number)">
                      <Phone className="w-3 h-3" /> Alt: {candidate.alt_phones.join(", ")}
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
            <div className="flex items-start gap-2 shrink-0">
              {candidate.status === "awaiting_input" && <SendInviteButton candidateId={candidate.id} />}
              <EditProfileButton candidate={candidate} resumeSignedUrl={resumeSignedUrl} resumeFileName={resumeFileName} />
              <StatusControl candidateId={candidate.id} currentStatus={candidate.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <StatChip label="Experience" value={candidate.total_experience_years ? formatExperience(candidate.total_experience_years) : null} />
            <StatChip label="Notice period" value={candidate.notice_period} />
            <StatChip
              label="Fixed CTC (now → expected)"
              value={candidate.current_fixed_ctc || candidate.expected_fixed_ctc ? `${candidate.current_fixed_ctc ? `₹${candidate.current_fixed_ctc}L` : "?"} → ${candidate.expected_fixed_ctc ? `₹${candidate.expected_fixed_ctc}L` : "?"}` : null}
            />
            <StatChip label="Group" value={[candidate.profile_group, candidate.profile_subgroup].filter(Boolean).join(" › ") || null} />
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

          {/* 2. The things you do most, always in the same place */}
          <div className="flex flex-wrap items-start gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <SendRole candidateId={candidate.id} candidateName={candidate.full_name} email={candidate.email} roles={(openMandates ?? []) as never} />
            <QuickContactActions candidateId={candidate.id} candidateName={candidate.full_name} phone={candidate.phone} email={candidate.email} missing={missingKeyDetails(candidate).map((m) => m.key)} />
            {resumeSignedUrl && resumeFileName && <ResumePreview signedUrl={resumeSignedUrl} fileName={resumeFileName} candidateId={candidate.id} />}
            {candidate.resume_file_url && !resumeSignedUrl && (
              <span className="flex items-center gap-1.5 text-[12px] font-medium text-rose-600 bg-rose-50 rounded-ros-md px-3 py-1.5">
                <FileText className="w-3 h-3" /> Resume file not found
              </span>
            )}
            <PoolControl candidateId={candidate.id} entry={poolEntry} />
          </div>
        </div>
      </Card>

      {/* 3. What to do next, and why it matters */}
      <Card className="mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">To do{todos.length ? ` (${todos.length})` : ""}</h2>
          {todos.some((t) => t.ask) && <AskMissingDetails candidateId={candidate.id} missing={missingNow.map((m) => m.label)} />}
        </div>
        {todos.length === 0 ? (
          <p className="mt-2 text-[13px] text-emerald-700 dark:text-emerald-300">Nothing pending. This profile is ready to put forward.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
            {todos.map((t) => (
              <li key={t.text} className="flex items-start gap-3 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${t.urgent ? "bg-rose-500" : "bg-amber-500"}`} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-slate-900 dark:text-slate-100">{t.text}</p>
                  <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{t.impact}</p>
                </div>
              </li>
            ))}
          </ul>
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
function StatChip({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-ros-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-[14px] font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{value || "—"}</p>
    </div>
  );
}
