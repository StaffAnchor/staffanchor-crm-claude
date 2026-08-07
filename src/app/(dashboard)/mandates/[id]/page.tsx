import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShortlistLinkPanel from "./shortlist-link-panel";
import AlignCandidatesPanel from "./align-candidates-panel";
import PublicListingPanel from "./public-listing-panel";
import JobDescriptionPanel from "./job-description-panel";
import BasicDetailsPanel from "./basic-details-panel";
import GoldStandardPanel from "./gold-standard-panel";
import ScreeningQuestionsPanel from "./screening-questions-panel";
import MustHavesPanel from "./must-haves-panel";
import FindMatchesPanel from "./find-matches-panel";
import { type MandateCandidateRow } from "./mandate-candidates-table";
import MandateCandidatesView from "./mandate-candidates-view";
import MandateSplitLayout from "./mandate-split-layout";
import DeleteMandateButton from "./delete-mandate-button";
import PublishMandateButton from "./publish-mandate-button";
import ArchiveMandateButton from "./archive-mandate-button";
import UnarchiveMandateButton from "./unarchive-mandate-button";
import MandateStaffingControl from "./mandate-staffing-control";
import DownloadJdButton from "./download-jd-button";
import QuickApplyFunnelPanel from "./quick-apply-funnel-panel";
import LinkedInSourcedPanel, { type SourcedProfile } from "./linkedin-sourced-panel";
import FeeSchedulePanel from "./fee-schedule-panel";
import { AlertTriangle, CalendarDays, Users, ClipboardCheck, ShieldAlert, ListChecks, Share2, ClipboardList, Link2 } from "lucide-react";
import { StatTile } from "@/components/ui/stat-tile";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { FillProbabilityTile } from "./fill-probability-tile";
import { computeFillProbability } from "@/lib/fill-probability";

function daysOpen(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default async function MandateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ back?: string; box?: string }>;
}) {
  const { id } = await params;
  const { back, box } = await searchParams;
  const supabase = await createClient();

  // Opened from a My Desk "Mandate Tasks" item -- send "back" to that box
  // instead of the firm-wide /mandates list, matching the same fix applied
  // to the candidate detail page for profile-completion tasks (a recruiter
  // clicking through from My Desk shouldn't lose that context on the way
  // back).
  const INBOX_BOX_LABEL: Record<string, string> = {
    mandate: "Mandate Tasks",
    pipeline: "Build Pipeline",
    profiles: "Profile Completion",
  };
  const backHref = back === "inbox" ? `/inbox?box=${box && INBOX_BOX_LABEL[box] ? box : "mandate"}` : "/mandates";
  const backLabel =
    back === "inbox" ? `← My Desk — ${INBOX_BOX_LABEL[box && INBOX_BOX_LABEL[box] ? box : "mandate"]}` : "← All mandates";

  const { data: mandate } = await supabase.from("mandates").select("*").eq("id", id).single();
  if (!mandate) notFound();

  // PublishMandateButton's own comment calls this a "recruiter-gated
  // publish step," but until now nothing actually enforced that -- any
  // signed-in staff role, including Partner, could flip a draft mandate
  // live behind only a plain window.confirm(). Fetched here and passed
  // down so the button can actually honor what it already claims to do.
  const {
    data: { user: viewerUser },
  } = await supabase.auth.getUser();
  const { data: viewerProfile } = viewerUser
    ? await supabase.from("profiles").select("role").eq("id", viewerUser.id).single()
    : { data: null };
  const viewerRole = viewerProfile?.role ?? null;

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, stage, in_shortlist, stage_source, stage_updated_at, client_decision_at, rejected_from_stage, date_of_joining, created_at, candidates(id, full_name, email, category, sub_domain, total_experience_years, current_fixed_ctc, recruiter_assessment, work_mode, open_to_relocation, notice_period, segment_data, current_employer, career_timeline_resume, career_timeline_profile, owner_id)"
    )
    .eq("mandate_id", id);

  // Distinct candidate IDs already screened against this mandate, so the
  // table can show an Assessed / Not Assessed badge without a separate
  // round-trip per row.
  const { data: screeningRows } = await supabase
    .from("mandate_screening_answers")
    .select("candidate_id")
    .eq("mandate_id", id);
  const screenedCandidateIds = Array.from(new Set((screeningRows ?? []).map((r) => r.candidate_id)));

  const { data: existingToken } = await supabase
    .from("shortlist_tokens")
    .select("token, first_opened_at, last_opened_at, open_count")
    .eq("mandate_id", id)
    .maybeSingle();

  // Fetched here (not lazily on the client) so the "Email to Client" bulk
  // action's contact picker opens instantly with the list already in hand,
  // same reasoning as fetching allCandidates/allStaffProfiles above.
  const { data: clientContacts } = mandate.client_id
    ? await supabase
        .from("client_contacts")
        .select("id, full_name, email, is_primary")
        .eq("client_id", mandate.client_id)
        .order("is_primary", { ascending: false })
    : { data: [] };

  // Client-level resource library (website, YouTube, profile PDF, etc.) --
  // shared across every mandate for this client, so it's fetched off
  // client_resources by client_id, not off the mandate itself. Surfaced as
  // a checklist in the "Email JD to candidates" flow (mandate-candidates-table.tsx).
  const { data: clientResources } = mandate.client_id
    ? await supabase
        .from("client_resources")
        .select("id, kind, name, url, storage_path, content_type")
        .eq("client_id", mandate.client_id)
        .order("created_at", { ascending: true })
    : { data: [] };

  // Same staleness check the daily email digest runs, but instant here --
  // no need to wait for cron to see it once you're already on the page.
  //
  // Keyed off stage === "submitted" AND stage_updated_at, NOT the legacy
  // in_shortlist/client_feedback/shortlisted_at columns -- those only get
  // written by the public client-shortlist-link flow. The common real-world
  // path (e.g. Kiwi Kisan / Amit Sharma: client coordinates by phone/email,
  // recruiter records the Yes/No via the Stage dropdown) never touches
  // those columns, so this used to keep insisting "awaiting client
  // feedback" even after the candidate had already moved to Client
  // Shortlisted, Offer, or Placed. Once stage has moved off "submitted"
  // at all, that IS the feedback.
  const STALE_DAYS = 4;
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleLinks } = await supabase
    .from("candidate_mandate_links")
    .select("stage_updated_at, candidates(full_name)")
    .eq("mandate_id", id)
    .eq("stage", "submitted")
    .lt("stage_updated_at", staleCutoff);

  const { data: assignments } = await supabase
    .from("mandate_assignments")
    .select("freelancer_id, profiles(id, full_name, email, role)")
    .eq("mandate_id", id);
  const { data: allStaffProfiles } = await supabase
    .from("profiles")
    .select("id, full_name, email, role")
    .order("full_name");

  const assignedStaff = (assignments ?? [])
    .map((a) => a.profiles as unknown as { id: string; full_name: string | null; email: string; role: string } | null)
    .filter((p): p is { id: string; full_name: string | null; email: string; role: string } => p !== null);

  const linkedCandidateIds = new Set((links ?? []).map((l) => (l.candidates as unknown as { id: string } | null)?.id).filter(Boolean));
  const { data: allCandidates } = await supabase
    .from("candidates")
    .select("id, full_name, category, sub_domain, current_employer")
    .order("created_at", { ascending: false })
    .limit(500);
  const availableCandidates = (allCandidates ?? []).filter((c) => !linkedCandidateIds.has(c.id));

  // LinkedIn-sourced profiles for this mandate -- kept in their own table
  // (mandate_sourced_profiles), deliberately separate from the real pipeline
  // (candidate_mandate_links, above) and quick-apply Applicants.
  const { data: sourcedProfiles } = await supabase
    .from("mandate_sourced_profiles")
    .select("id, linkedin_url, full_name, location, current_company, outreach_status, notes, created_at, promoted_candidate_id")
    .eq("mandate_id", id)
    .order("created_at", { ascending: false });

  // Health-strip math -- the same signals the mandates list page already
  // computes per row (Needs sourcing / Aging, no submissions / stale
  // feedback), reused here so "what's blocking this mandate" is answerable
  // in one glance instead of requiring a scroll through 10 panels to find
  // the relevant field. See mandates/page.tsx / mandates-grid.tsx for the
  // list-view equivalent of this logic.
  const pipelineCount = (links ?? []).length;
  const submittedCount = (links ?? []).filter((l) =>
    ["submitted", "client_interview", "offer", "placed"].includes(l.stage)
  ).length;
  // Derived live from candidate_mandate_links, never a stored column --
  // single source of truth for "how many of this mandate's openings have
  // we actually filled" (see mandates.headcount / basic-details-panel.tsx).
  const placedCount = (links ?? []).filter((l) => l.stage === "placed").length;
  const daysOpenNum = daysOpen(mandate.created_at);
  const screenedCount = screenedCandidateIds.length;

  const blockers: { label: string; tone: "warning" | "danger" }[] = [];
  if (assignedStaff.length === 0 && mandate.status !== "closed") {
    blockers.push({ label: "No recruiter/vendor staffed", tone: "danger" });
  }
  if (mandate.status === "open" && pipelineCount === 0 && daysOpenNum >= 3) {
    blockers.push({ label: "Needs sourcing", tone: "warning" });
  }
  if (staleLinks && staleLinks.length > 0) {
    blockers.push({ label: `${staleLinks.length} awaiting client feedback`, tone: "danger" });
  }
  if (mandate.status === "open" && daysOpenNum >= 21 && submittedCount === 0) {
    blockers.push({ label: "Aging, no submissions", tone: "warning" });
  }

  // Fill probability -- only meaningful while a mandate is actually being
  // worked (open); a draft has no activity to score yet, and a
  // closed/placed mandate's outcome is already known.
  const topMatchScore = (mandate.auto_match_results as { score: number }[] | null)?.[0]?.score ?? null;
  const fillProbability =
    mandate.status === "open"
      ? computeFillProbability({
          daysOpen: daysOpenNum,
          staffCount: assignedStaff.length,
          pipelineCount,
          submittedCount,
          screenedCount,
          staleFeedbackCount: staleLinks?.length ?? 0,
          topMatchScore,
        })
      : null;

  return (
    <div>
      <Link href={backHref} className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-200">
        {backLabel}
      </Link>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 mt-2 shadow-sm flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{mandate.role_title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {mandate.client_name} · {mandate.city ?? "—"} ·{" "}
            {mandate.category?.replace("_", " ")} / {mandate.sub_domain}
          </p>
          <MandateStaffingControl mandateId={id} initialAssigned={assignedStaff} allProfiles={allStaffProfiles ?? []} />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DownloadJdButton mandateId={id} />
          {mandate.is_archived ? (
            <UnarchiveMandateButton mandateId={id} />
          ) : (
            <ArchiveMandateButton
              mandateId={id}
              currentStatus={mandate.status}
              headcount={mandate.headcount}
              placedCount={placedCount}
            />
          )}
          <DeleteMandateButton mandateId={id} roleTitle={mandate.role_title} />
        </div>
      </div>

      {mandate.is_archived && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
          <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
            This mandate is archived -- real status is still &quot;{mandate.status.replace("_", " ")}
            &quot;{mandate.archived_reason ? ` (${mandate.archived_reason})` : ""}
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">
            {mandate.archived_at ? `Archived ${new Date(mandate.archived_at).toLocaleDateString()}. ` : ""}
            It won't show up in the active Mandates list, cron sweeps, or open-mandate counts until reactivated.
          </p>
        </div>
      )}

      {mandate.status === "draft" && (
        <PublishMandateButton mandateId={id} staffCount={assignedStaff.length} viewerRole={viewerRole} />
      )}

      {/* Health strip -- everything a recruiter needs to answer "is this
          mandate in trouble" without opening a single panel below. */}
      <div
        className={`mt-3 grid grid-cols-2 gap-2 ${
          [true, fillProbability, mandate.headcount > 1].filter(Boolean).length >= 3 ? "sm:grid-cols-6" : fillProbability ? "sm:grid-cols-5" : "sm:grid-cols-4"
        }`}
      >
        <StatTile label="Days open" value={daysOpenNum} icon={<CalendarDays className="h-4 w-4" />} accent={daysOpenNum >= 21} />
        <StatTile label="In pipeline" value={pipelineCount} icon={<Users className="h-4 w-4" />} />
        <StatTile label="Submitted to client" value={submittedCount} icon={<Share2 className="h-4 w-4" />} />
        <StatTile
          label="Screened"
          value={pipelineCount > 0 ? `${screenedCount}/${pipelineCount}` : "—"}
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
        {mandate.headcount > 1 && (
          <StatTile
            label="Openings filled"
            value={`${placedCount}/${mandate.headcount}`}
            icon={<Users className="h-4 w-4" />}
            accent={placedCount >= mandate.headcount}
          />
        )}
        {fillProbability && <FillProbabilityTile probability={fillProbability} />}
      </div>
      {fillProbability && (
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          Fill probability driver: {fillProbability.driver}
        </p>
      )}

      {blockers.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
          {blockers.map((b) => (
            <Badge key={b.label} tone={b.tone} size="sm" icon={<AlertTriangle className="w-2.5 h-2.5" />}>
              {b.label}
            </Badge>
          ))}
        </div>
      )}

      {staleLinks && staleLinks.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-[13px] text-amber-800">
            <span className="font-medium">{mandate.client_name}</span> hasn&apos;t given feedback on{" "}
            {staleLinks.length} candidate{staleLinks.length === 1 ? "" : "s"} shared {STALE_DAYS}+ days ago —
            worth a follow-up:{" "}
            {staleLinks
              .map((l) => (l.candidates as unknown as { full_name: string } | null)?.full_name)
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
      )}

      <MandateSplitLayout
        left={
        <MandateCandidatesView
          rows={(links ?? [])
            .map((l) => {
              const cand = l.candidates as unknown as MandateCandidateRow["candidate"] | null;
              if (!cand) return null;
              return {
                id: l.id,
                stage: l.stage,
                in_shortlist: l.in_shortlist,
                stage_source: l.stage_source,
                stage_updated_at: l.stage_updated_at,
                client_decision_at: l.client_decision_at,
                rejected_from_stage: l.rejected_from_stage,
                date_of_joining: l.date_of_joining,
                created_at: l.created_at,
                candidate: cand,
                screened: screenedCandidateIds.includes(cand.id),
              };
            })
            .filter((r): r is MandateCandidateRow => r !== null)}
          mandateContext={{
            mandateId: id,
            role_title: mandate.role_title,
            category: mandate.category,
            sub_domains: mandate.sub_domains ?? (mandate.sub_domain ? [mandate.sub_domain] : []),
            sales_cycle: mandate.sales_cycle,
            deal_size_band: mandate.deal_size_band,
            deal_size_currency: mandate.deal_size_currency ?? "INR",
            customer_profile: mandate.customer_profile,
            jd_candidate_profile: mandate.jd_candidate_profile,
            must_haves: mandate.must_haves ?? [],
            team_handling: mandate.team_handling,
            team_size_band: mandate.team_size_band,
            work_mode: mandate.work_mode,
            cities: mandate.cities ?? (mandate.city ? [mandate.city] : []),
            client_name: mandate.client_name,
            screening_questions: mandate.screening_questions ?? [],
            clientId: mandate.client_id,
            clientContacts: clientContacts ?? [],
            clientResources: clientResources ?? [],
          }}
          teamMembers={allStaffProfiles ?? []}
          isAdmin={viewerRole === "admin"}
        />
        }
        right={
        <>
        {/* The 10 independently-saving panels this page used to render in
            one long scroll (see "Close Mandates cockpit" in the Recruiter
            OS roadmap) -- grouped behind tabs by what a recruiter is
            actually trying to do, so getting to Job Description no longer
            means scrolling past Screening Questions and Find Matches. */}
        <Tabs
          items={[
            {
              key: "intake",
              label: "Intake",
              icon: <ClipboardList className="h-3.5 w-3.5" />,
              content: (
                <>
                  <BasicDetailsPanel
                    mandateId={id}
                    initial={{
                      role_title: mandate.role_title,
                      client_name: mandate.client_name,
                      category: mandate.category,
                      sub_domains: mandate.sub_domains ?? (mandate.sub_domain ? [mandate.sub_domain] : []),
                      cities: mandate.cities ?? (mandate.city ? [mandate.city] : []),
                      budget_min: mandate.budget_min,
                      budget_max: mandate.budget_max,
                      experience_min: mandate.experience_min,
                      experience_max: mandate.experience_max,
                      status: mandate.status,
                      headcount: mandate.headcount,
                    }}
                    placedCount={placedCount}
                  />
                  <GoldStandardPanel
                    mandateId={id}
                    initial={{
                      category: mandate.category,
                      hiring_reason: mandate.hiring_reason,
                      team_handling: mandate.team_handling,
                      team_size_band: mandate.team_size_band,
                      work_mode: mandate.work_mode,
                      working_days: mandate.working_days,
                      shift_timing: mandate.shift_timing,
                      reporting_manager_title: mandate.reporting_manager_title,
                      company_size_band: mandate.company_size_band,
                      company_highlight_links: mandate.company_highlight_links ?? [],
                      sales_cycle: mandate.sales_cycle,
                      deal_size_currency: mandate.deal_size_currency,
                      deal_size_band: mandate.deal_size_band,
                      customer_profile: mandate.customer_profile,
                      expectation_3_month: mandate.expectation_3_month,
                      expectation_6_month: mandate.expectation_6_month,
                      expectation_1_year: mandate.expectation_1_year,
                      selling_style: mandate.selling_style,
                      preferred_industries: mandate.preferred_industries ?? [],
                      industries_sold_to: mandate.industries_sold_to ?? [],
                      languages_required: mandate.languages_required ?? [],
                      week_off: mandate.week_off ?? [],
                      week_off_type: mandate.week_off_type,
                      rotational_offs_per_week: mandate.rotational_offs_per_week,
                      mandatory_working_days: mandate.mandatory_working_days ?? [],
                      b2c_customer_types: mandate.b2c_customer_types ?? [],
                      client_profile: mandate.client_profile ?? [],
                    }}
                  />
                  <JobDescriptionPanel
                    mandateId={id}
                    initial={{
                      jd_overview: mandate.jd_overview,
                      jd_responsibilities: mandate.jd_responsibilities,
                      jd_candidate_profile: mandate.jd_candidate_profile,
                      jd_compensation_benefits: mandate.jd_compensation_benefits,
                    }}
                    context={{
                      role_title: mandate.role_title,
                      category: mandate.category,
                      sub_domains: mandate.sub_domains ?? (mandate.sub_domain ? [mandate.sub_domain] : []),
                      cities: mandate.cities ?? (mandate.city ? [mandate.city] : []),
                      experience_min: mandate.experience_min,
                      experience_max: mandate.experience_max,
                      budget_min: mandate.budget_min,
                      budget_max: mandate.budget_max,
                      client_name: mandate.client_name,
                    }}
                  />
                  <MustHavesPanel
                    mandateId={id}
                    initialMustHaves={mandate.must_haves ?? []}
                    initialGoodToHaves={mandate.good_to_haves ?? []}
                  />
                  <FeeSchedulePanel mandateId={id} initial={(mandate.fee_tranche_template ?? []) as never} />
                </>
              ),
            },
            {
              key: "screening",
              label: "Screening & Matching",
              icon: <ListChecks className="h-3.5 w-3.5" />,
              content: (
                <>
                  <ScreeningQuestionsPanel
                    mandateId={id}
                    initialQuestions={mandate.screening_questions ?? []}
                    context={{
                      role_title: mandate.role_title,
                      category: mandate.category,
                      sub_domains: mandate.sub_domains ?? (mandate.sub_domain ? [mandate.sub_domain] : []),
                      sales_cycle: mandate.sales_cycle,
                      deal_size_band: mandate.deal_size_band,
                      customer_profile: mandate.customer_profile,
                      jd_candidate_profile: mandate.jd_candidate_profile,
                      must_haves: mandate.must_haves ?? [],
                      team_handling: mandate.team_handling,
                      team_size_band: mandate.team_size_band,
                      work_mode: mandate.work_mode,
                      cities: mandate.cities ?? (mandate.city ? [mandate.city] : []),
                    }}
                  />
                  <FindMatchesPanel
                    mandateId={id}
                    initialMatches={mandate.auto_match_results ?? null}
                    initialComputedAt={mandate.auto_match_computed_at ?? null}
                  />
                  <Link
                    href={`/mandates/${id}/matches`}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/30 text-[13px] font-medium py-2"
                  >
                    Open full matching workspace →
                  </Link>
                </>
              ),
            },
            {
              key: "sourcing",
              label: "Sourcing",
              icon: <Users className="h-3.5 w-3.5" />,
              content: <AlignCandidatesPanel mandateId={id} availableCandidates={availableCandidates} />,
            },
            {
              key: "linkedin-sourced",
              label: "LinkedIn Sourced",
              icon: <Link2 className="h-3.5 w-3.5" />,
              content: (
                <LinkedInSourcedPanel mandateId={id} initialProfiles={(sourcedProfiles ?? []) as SourcedProfile[]} />
              ),
            },
            {
              key: "sharing",
              label: "Sharing & Public Listing",
              icon: <Share2 className="h-3.5 w-3.5" />,
              content: (
                <>
                  <QuickApplyFunnelPanel mandateId={id} />
                  <PublicListingPanel
                    mandateId={id}
                    initialShowClientName={mandate.show_client_name ?? true}
                    initialPublicClientLabel={mandate.public_client_label}
                    clientName={mandate.client_name}
                  />
                  <ShortlistLinkPanel
                    mandateId={id}
                    existingToken={existingToken?.token ?? null}
                    firstOpenedAt={existingToken?.first_opened_at ?? null}
                    lastOpenedAt={existingToken?.last_opened_at ?? null}
                    openCount={existingToken?.open_count ?? 0}
                  />
                </>
              ),
            },
          ]}
        />

        {mandate.client_id && (
          <Link
            href={`/clients/${mandate.client_id}`}
            className="mt-6 block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-sm text-slate-700 dark:text-slate-300"
          >
            <span className="font-medium text-blue-600">Manage {mandate.client_name} →</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Client details, contacts, and portal access are managed once per client, not per mandate.
            </p>
          </Link>
        )}
        </>
        }
      />
    </div>
  );
}
