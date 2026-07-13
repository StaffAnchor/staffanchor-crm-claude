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
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import DeleteMandateButton from "./delete-mandate-button";
import PublishMandateButton from "./publish-mandate-button";
import MandateStaffingControl from "./mandate-staffing-control";
import DownloadJdButton from "./download-jd-button";
import QuickApplyFunnelPanel from "./quick-apply-funnel-panel";
import { AlertTriangle } from "lucide-react";

export default async function MandateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: mandate } = await supabase.from("mandates").select("*").eq("id", id).single();
  if (!mandate) notFound();

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "id, stage, in_shortlist, candidates(id, full_name, email, category, sub_domain, total_experience_years, current_fixed_ctc, recruiter_assessment, work_mode, open_to_relocation, notice_period, segment_data, current_employer, career_timeline_resume, career_timeline_profile)"
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
    .select("token")
    .eq("mandate_id", id)
    .maybeSingle();

  // Same staleness check the daily email digest runs, but instant here --
  // no need to wait for cron to see it once you're already on the page.
  const STALE_DAYS = 4;
  const staleCutoff = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: staleLinks } = await supabase
    .from("candidate_mandate_links")
    .select("shortlisted_at, candidates(full_name)")
    .eq("mandate_id", id)
    .eq("in_shortlist", true)
    .is("client_feedback", null)
    .lt("shortlisted_at", staleCutoff);

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

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <Link href="/mandates" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 dark:text-slate-200">
          ← All mandates
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
            <DeleteMandateButton mandateId={id} roleTitle={mandate.role_title} />
          </div>
        </div>

        {mandate.status === "draft" && <PublishMandateButton mandateId={id} staffCount={assignedStaff.length} />}

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

        <MandateCandidatesTable
          rows={(links ?? [])
            .map((l) => {
              const cand = l.candidates as unknown as MandateCandidateRow["candidate"] | null;
              if (!cand) return null;
              return {
                id: l.id,
                stage: l.stage,
                in_shortlist: l.in_shortlist,
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
          }}
        />
      </div>

      <div className="space-y-6">
        <QuickApplyFunnelPanel mandateId={id} />
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
          }}
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
        <PublicListingPanel
          mandateId={id}
          initialShowClientName={mandate.show_client_name ?? true}
          initialPublicClientLabel={mandate.public_client_label}
          clientName={mandate.client_name}
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
          }}
        />
        <MustHavesPanel
          mandateId={id}
          initialMustHaves={mandate.must_haves ?? []}
          initialGoodToHaves={mandate.good_to_haves ?? []}
        />
        <FindMatchesPanel
          mandateId={id}
          initialMatches={mandate.auto_match_results ?? null}
          initialComputedAt={mandate.auto_match_computed_at ?? null}
        />
        <AlignCandidatesPanel mandateId={id} availableCandidates={availableCandidates} />
        <ShortlistLinkPanel mandateId={id} existingToken={existingToken?.token ?? null} />
        {mandate.client_id && (
          <Link
            href={`/clients/${mandate.client_id}`}
            className="block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-sm text-slate-700 dark:text-slate-300"
          >
            <span className="font-medium text-blue-600">Manage {mandate.client_name} →</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Client details, contacts, and portal access are managed once per client, not per mandate.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
