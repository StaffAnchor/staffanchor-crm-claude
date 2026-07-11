import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ShortlistLinkPanel from "./shortlist-link-panel";
import AlignCandidatesPanel from "./align-candidates-panel";
import PublicListingPanel from "./public-listing-panel";
import JobDescriptionPanel from "./job-description-panel";
import BasicDetailsPanel from "./basic-details-panel";
import MustHavesPanel from "./must-haves-panel";
import FindMatchesPanel from "./find-matches-panel";
import MandateCandidatesTable, { type MandateCandidateRow } from "./mandate-candidates-table";
import DeleteMandateButton from "./delete-mandate-button";
import StaffingPanel from "./staffing-panel";
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
    .select("id, stage, in_shortlist, candidates(id, full_name, category, sub_domain, total_experience_years, current_fixed_ctc, recruiter_assessment)")
    .eq("mandate_id", id);

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
          </div>
          <DeleteMandateButton mandateId={id} roleTitle={mandate.role_title} />
        </div>

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
              return { id: l.id, stage: l.stage, in_shortlist: l.in_shortlist, candidate: cand };
            })
            .filter((r): r is MandateCandidateRow => r !== null)}
        />
      </div>

      <div className="space-y-6">
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
        <StaffingPanel
          mandateId={id}
          initialAssigned={(assignments ?? [])
            .map((a) => a.profiles as unknown as { id: string; full_name: string | null; email: string; role: string } | null)
            .filter((p): p is { id: string; full_name: string | null; email: string; role: string } => p !== null)}
          allProfiles={allStaffProfiles ?? []}
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
