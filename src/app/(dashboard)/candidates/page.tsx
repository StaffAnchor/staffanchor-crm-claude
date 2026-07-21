import Link from "next/link";
import type { ReactNode } from "react";
import { SlidersHorizontal, AlertTriangle, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesTable from "./candidates-table";
import {
  industryOptions,
  employmentStatusOptions,
  highestQualificationOptions as QUALIFICATION_OPTIONS,
  workModeOptions,
  roleLevelOptions,
  languageOptions,
  b2bSalesMotionTypeOptions,
  b2cSalesMotionOptions,
  profileTypeOptions,
  level1OptionsForProfileType,
  secondarySpecializationGroups,
} from "@/lib/candidate-options";
import { STAGES as MANDATE_STAGES } from "@/lib/mandate-stage";

// Primary Specialization filter must show the *actual* taxonomy recruiters
// pick from on the intake form (grouped by Current Profile Type), not just
// whatever sub_domain strings happen to already exist in the candidates
// table -- a DB scan silently drops any specialization no candidate has
// been tagged with yet, which is exactly backwards for a filter meant to
// help recruiters find candidates by what they're hiring for.
const PRIMARY_SPECIALIZATION_GROUPS = profileTypeOptions.map((pt) => ({
  group: pt.label,
  options: level1OptionsForProfileType(pt.value),
}));
const CANONICAL_PRIMARY_SPECIALIZATIONS = new Set(PRIMARY_SPECIALIZATION_GROUPS.flatMap((g) => g.options));

// Bulk CV Upload (and any future non-portal ingestion path) lands here too,
// alongside the three original mechanisms -- keeps "how a candidate entered
// the system" as one closed set instead of drifting into free text.
const SOURCE_CHANNEL_OPTIONS = ["Naukri", "LinkedIn", "IIMJobs", "Monster", "Referral", "Other"];

// role_type is stored in segment_data as "IC" or "Team Lead" (see ApplyForm's
// mapping in jobs-staffanchor-clean) -- distinct from the UI labels used on
// the intake form, so the filter values below match the stored strings.
const ROLE_TYPE_FILTER_OPTIONS = [
  { value: "IC", label: "Individual Contributor" },
  { value: "Team Lead", label: "Leading a Team" },
];
import { MiniStat, StatSection } from "@/components/ui/mini-stat";
import { MultiSelectFilter } from "@/components/ui/multi-select-filter";

// "More filters" panel is grouped into named sections (rather than one long
// wrapped row) so it reads as a designed control surface instead of a form
// dump -- each section title doubles as a scan anchor for "is X filterable?".
function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-w-[220px]">
      <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{title}</p>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  );
}
function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

// Active-filter removable pill -- was 10 near-identical inline className
// strings (bg-blue-50/emerald-50/orange-50 + ring + text-[12px], repeated
// per filter type) collapsed into one component driven by the same
// semantic tone vocabulary as the shared Badge primitive, so "what does
// this color mean" stays consistent with the rest of the app instead of
// being re-decided per filter.
const ACTIVE_FILTER_TONE_CLASSES = {
  accent: "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-blue-200/60 dark:ring-blue-800/60",
  success:
    "bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 ring-emerald-200/60 dark:ring-emerald-800/60",
  warning:
    "bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 ring-orange-200/60 dark:ring-orange-800/60",
} as const;

function ActiveFilterChip({
  href,
  tone = "accent",
  children,
}: {
  href: string;
  tone?: keyof typeof ACTIVE_FILTER_TONE_CLASSES;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`text-ros-body-sm font-medium px-3 py-1 rounded-full ring-1 transition-all duration-200 ease-ros ${ACTIVE_FILTER_TONE_CLASSES[tone]}`}
    >
      {children}
    </Link>
  );
}

const STATUS_LABEL: Record<string, string> = {
  awaiting_input: "Awaiting Input",
  lead: "Lead",
  registered: "Registered",
  under_review: "Under Review",
  shortlisted: "Shortlisted",
  submitted: "Submitted",
  client_interview: "Client Interview",
  offer: "Offer",
  placed: "Placed",
  alumni: "Alumni",
  inactive: "Inactive",
};

// Labels for candidate_mandate_links.stage (the per-mandate pipeline, see
// lib/mandate-stage.ts) -- distinct from STATUS_LABEL above, which is now
// profile-lifecycle-only. A candidate can be "Client Shortlisted" on one
// mandate and "Rejected" on another at the same time, so these counts are
// "how many candidates have at least one mandate at this stage," not a
// single mutually-exclusive bucket like the status funnel above.
const STAGE_LABEL: Record<string, string> = {
  sourced: "Sourced",
  screened: "Screened",
  shortlisted: "Shortlisted (recruiter)",
  submitted: "Submitted",
  client_interview: "Client Interview",
  client_shortlisted: "Client Shortlisted",
  offer: "Offer",
  placed: "Placed",
  rejected: "Rejected",
};

const ORIGIN_LABEL: Record<string, string> = {
  quick_apply: "Job Quick Apply",
  self_registration: "Build Your Profile",
  candidate_self_signup: "Build Your Profile",
  recruiter_created: "Recruiter Created (one at a time)",
  bulk_resume_upload: "Bulk CV Upload",
  bulk_import: "One-Time Upload (Zoho)",
};


const CATEGORIES = [
  { value: "", label: "All" },
  { value: "b2b_sales", label: "B2B Sales" },
  { value: "b2c_sales", label: "B2C Sales" },
  { value: "non_sales", label: "Non-Sales" },
];

const RECOMMENDATIONS = ["Strong Fit", "Fit with Reservations", "Not a Fit"];

const NOTICE_PERIODS = ["Immediate", "15 days", "30 days", "60 days", "90 days"];

const JOB_STABILITY_OPTIONS = ["Stable", "Some Movement", "Frequent Job-Hopper"];
const RELOCATION_VERIFIED_OPTIONS = ["Yes", "No", "Conditional"];
const SCORE_OPTIONS = [1, 2, 3, 4, 5];

type SearchParams = {
  q?: string;
  category?: string;
  status?: string;
  min_ctc?: string;
  max_ctc?: string;
  min_exp?: string;
  recommendation?: string;
  sub_domain?: string;
  notice_period?: string;
  job_stability?: string;
  relocation_verified?: string;
  min_communication?: string;
  min_confidence?: string;
  min_coachability?: string;
  location?: string;
  secondary_domain?: string;
  current_industry?: string;
  previous_industry?: string;
  origin?: string;
  incomplete?: string;
  from?: string;
  to?: string;
  recruiter?: string;
  placed_only?: string;
  page?: string;
  ids?: string;
  mandate?: string;
  mandate_stage?: string;
  employment_status?: string;
  highest_qualification?: string;
  work_mode?: string;
  open_to_relocation?: string;
  role_level?: string;
  role_type?: string;
  language?: string;
  b2b_motion?: string;
  b2c_motion?: string;
  source_channel?: string;
};

const PAGE_SIZE = 100;

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const pageNum = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
  const rangeFrom = (pageNum - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  // Resolved once, up front, since it requires its own async lookup and is
  // then reused identically by both the page-of-rows query and the
  // filtered-count query below (so pagination and the "N candidates" total
  // always agree on exactly the same underlying candidate ID set).
  let recruiterCandidateIds: string[] | null = null;
  if (params.recruiter) {
    let linkQuery = supabase.from("candidate_mandate_links").select("candidate_id").eq("added_by", params.recruiter);
    if (params.placed_only) linkQuery = linkQuery.eq("stage", "placed");
    const { data: recruiterLinks } = await linkQuery;
    recruiterCandidateIds = Array.from(new Set((recruiterLinks ?? []).map((l) => l.candidate_id)));
  }

  // Same resolve-then-reuse pattern as recruiterCandidateIds above, for the
  // Mandates table's "Applications" column -- clicking the count needs to
  // land here already filtered to just that mandate's linked candidates.
  let mandateCandidateIds: string[] | null = null;
  if (params.mandate) {
    const { data: mandateLinks } = await supabase
      .from("candidate_mandate_links")
      .select("candidate_id")
      .eq("mandate_id", params.mandate);
    mandateCandidateIds = Array.from(new Set((mandateLinks ?? []).map((l) => l.candidate_id)));
  }

  // "Client Shortlisted" / "Submitted" / etc. on the KPI tiles and Hiring
  // pipeline strip now live on candidate_mandate_links.stage rather than
  // candidates.status (see Phase 1 of the pipeline-stage split) -- so
  // filtering the main table by one of those stages means resolving which
  // candidates have at least one mandate link at that stage first, same
  // resolve-then-.in("id", ...) pattern as recruiterCandidateIds above.
  let mandateStageCandidateIds: string[] | null = null;
  if (params.mandate_stage) {
    const { data: stageLinks } = await supabase
      .from("candidate_mandate_links")
      .select("candidate_id")
      .in("stage", params.mandate_stage.split(","));
    mandateStageCandidateIds = Array.from(new Set((stageLinks ?? []).map((l) => l.candidate_id)));
  }

  // Applies every filter to a given query builder. Shared by the data query
  // (below) and the count query so page-of-rows and total-matching-count
  // can never drift out of sync with each other.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function applyFilters(q: any): any {
    let qq = q;
    if (params.q) {
      qq = qq.or(
        `full_name.ilike.%${params.q}%,email.ilike.%${params.q}%,current_employer.ilike.%${params.q}%`
      );
    }
    if (params.category) qq = qq.eq("category", params.category);
    if (params.status) qq = qq.in("status", params.status.split(","));
    if (params.min_ctc) qq = qq.gte("current_fixed_ctc", Number(params.min_ctc));
    if (params.max_ctc) qq = qq.lte("current_fixed_ctc", Number(params.max_ctc));
    if (params.min_exp) qq = qq.gte("total_experience_years", Number(params.min_exp));
    if (params.sub_domain) qq = qq.in("sub_domain", params.sub_domain.split(","));
    if (params.location) qq = qq.in("current_location", params.location.split(","));
    if (params.secondary_domain) qq = qq.overlaps("secondary_sub_domains", params.secondary_domain.split(","));
    // segment_data.languages_known / .b2b_sales_motion_type are jsonb arrays
    // nested inside the segment_data column (not their own top-level array
    // columns like secondary_sub_domains above), so containment needs the
    // 'cs' (contains) jsonb operator against the JSON path expression rather
    // than .contains(). b2c motion lives at segment_data.motion (mirrors the
    // key ApplyForm.tsx actually writes -- see jobs-staffanchor ApplyForm.tsx).
    if (params.language) {
      const vals = params.language.split(",");
      qq = qq.or(vals.map((v) => `segment_data->languages_known.cs.${JSON.stringify([v])}`).join(","));
    }
    if (params.b2b_motion) {
      const vals = params.b2b_motion.split(",");
      qq = qq.or(vals.map((v) => `segment_data->b2b_sales_motion_type.cs.${JSON.stringify([v])}`).join(","));
    }
    if (params.b2c_motion) {
      const vals = params.b2c_motion.split(",");
      qq = qq.or(vals.map((v) => `segment_data->motion.cs.${JSON.stringify([v])}`).join(","));
    }
    if (params.source_channel) qq = qq.in("source_channel", params.source_channel.split(","));
    if (params.current_industry) qq = qq.in("current_industry", params.current_industry.split(","));
    if (params.previous_industry) {
      const vals = params.previous_industry.split(",");
      qq = qq.overlaps("industries", vals);
      // The exclude-if-also-current-industry behavior only makes
      // unambiguous sense for a single selected value -- with multiple
      // values selected it's no longer clear which one should exclude,
      // so it's dropped rather than guessed at.
      if (vals.length === 1) qq = qq.neq("current_industry", vals[0]);
    }
    if (params.origin) qq = qq.in("created_by", params.origin.split(","));
    if (params.incomplete) qq = qq.in("status", ["awaiting_input", "lead"]);
    if (params.ids) {
      const idList = params.ids.split(",").map((s) => s.trim()).filter(Boolean);
      qq = qq.in("id", idList.length ? idList : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (params.from) qq = qq.gte("created_at", params.from);
    if (params.to) qq = qq.lte("created_at", `${params.to}T23:59:59.999`);
    if (recruiterCandidateIds) {
      qq = qq.in("id", recruiterCandidateIds.length ? recruiterCandidateIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (mandateCandidateIds) {
      qq = qq.in("id", mandateCandidateIds.length ? mandateCandidateIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (mandateStageCandidateIds) {
      qq = qq.in("id", mandateStageCandidateIds.length ? mandateStageCandidateIds : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (params.notice_period) qq = qq.in("notice_period", params.notice_period.split(","));
    if (params.employment_status) qq = qq.in("current_employment_status", params.employment_status.split(","));
    if (params.highest_qualification) qq = qq.in("highest_qualification", params.highest_qualification.split(","));
    if (params.work_mode) qq = qq.in("work_mode", params.work_mode.split(","));
    if (params.open_to_relocation) qq = qq.eq("open_to_relocation", params.open_to_relocation);
    if (params.role_level) qq = qq.in("segment_data->>role_level", params.role_level.split(","));
    if (params.role_type) qq = qq.eq("segment_data->>role_type", params.role_type);
    if (params.recommendation) {
      qq = qq.in("recruiter_assessment->>overall_recommendation", params.recommendation.split(","));
    }
    if (params.job_stability) {
      qq = qq.in("recruiter_assessment->>job_stability", params.job_stability.split(","));
    }
    if (params.relocation_verified) {
      qq = qq.in("recruiter_assessment->>relocation_verified", params.relocation_verified.split(","));
    }
    if (params.min_communication) {
      qq = qq.gte("recruiter_assessment->>communication_score", params.min_communication);
    }
    if (params.min_confidence) {
      qq = qq.gte("recruiter_assessment->>confidence_score", params.min_confidence);
    }
    if (params.min_coachability) {
      qq = qq.gte("recruiter_assessment->>coachability_score", params.min_coachability);
    }
    return qq;
  }

  const baseQuery = supabase
    .from("candidates")
    .select(
      "id, full_name, email, phone, current_location, current_employer, current_job_title, category, sub_domain, secondary_sub_domains, current_industry, industries, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_employment_status, highest_qualification, work_mode, open_to_relocation, status, created_by, recruiter_assessment, segment_data, resume_file_url, ai_summary, created_at"
    )
    .order("created_at", { ascending: false })
    .range(rangeFrom, rangeTo);
  const query = applyFilters(baseQuery);

  const { data: candidates, error } = (await query) as {
    data: Array<Record<string, unknown> & { id: string; resume_file_url: string | null }> | null;
    error: { message: string } | null;
  };

  const countQuery = applyFilters(
    supabase.from("candidates").select("id", { count: "exact", head: true })
  );
  const { count: filteredCount } = (await countQuery) as { count: number | null };
  const totalFiltered = filteredCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const rangeStart = totalFiltered === 0 ? 0 : rangeFrom + 1;
  const rangeEnd = Math.min(rangeFrom + PAGE_SIZE, totalFiltered);

  // Batch-generate resume signed URLs in one Storage API call instead of
  // leaving each table row to fire its own createSignedUrl request on
  // mount -- with the Resume column visible (the default), that used to
  // mean up to 100 separate client-side round trips per page load. One
  // batched createSignedUrls call here covers every row's resume at once.
  const resumePaths = Array.from(
    new Set(
      (candidates ?? [])
        .map((c) => c.resume_file_url)
        .filter((p): p is string => Boolean(p))
        .map((p) => p.replace(/^resumes\//, ""))
    )
  );
  const resumeUrlByPath: Record<string, string> = {};
  if (resumePaths.length > 0) {
    const { data: signedBatch } = await supabase.storage.from("resumes").createSignedUrls(resumePaths, 60 * 60);
    (signedBatch ?? []).forEach((s) => {
      if (s.signedUrl && !s.error && s.path) resumeUrlByPath[s.path] = s.signedUrl;
    });
  }
  const candidatesWithResumeUrls = (candidates ?? []).map((c) => ({
    ...c,
    resume_signed_url: c.resume_file_url ? resumeUrlByPath[c.resume_file_url.replace(/^resumes\//, "")] ?? null : null,
  }));

  const candidateIds = (candidates ?? []).map((c) => c.id);
  const mandateLinksByCandidate: Record<string, { mandate_id: string; role_title: string; client_name: string }[]> = {};
  if (candidateIds.length > 0) {
    const { data: linkRows } = await supabase
      .from("candidate_mandate_links")
      .select("candidate_id, mandate_id, mandates(role_title, client_name)")
      .in("candidate_id", candidateIds);
    (linkRows ?? []).forEach((row) => {
      const mandate = row.mandates as unknown as { role_title: string; client_name: string } | null;
      if (!mandate) return;
      const list = mandateLinksByCandidate[row.candidate_id] ?? [];
      list.push({ mandate_id: row.mandate_id, role_title: mandate.role_title, client_name: mandate.client_name });
      mandateLinksByCandidate[row.candidate_id] = list;
    });
  }

  let recruiterName: string | null = null;
  if (params.recruiter) {
    const { data: recruiterProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", params.recruiter)
      .single();
    recruiterName = recruiterProfile?.full_name ?? recruiterProfile?.email ?? null;
  }

  const { data: openMandates } = await supabase
    .from("mandates")
    .select("id, role_title, client_name")
    .eq("status", "open")
    .order("created_at", { ascending: false });

  // Single unfiltered scan of the candidates table covering both the
  // sub-domain filter dropdown and the status/origin stat tiles -- these
  // used to be two separate full-table round trips (one for sub_domain
  // alone, one for status/created_at/created_by) even though they're
  // reading the same rows; combining the column list into one query halves
  // the redundant traffic without changing any of the derived numbers.
  const { data: allRows } = await supabase
    .from("candidates")
    .select("sub_domain, status, created_at, created_by, current_location, recruiter_assessment");
  // Anything actually on a candidate record that ISN'T in the current
  // canonical taxonomy (pre-taxonomy-unification legacy values like "SaaS
  // Sales") still needs to stay filterable -- surfaced as a separate group
  // below the real taxonomy instead of silently disappearing.
  const legacySubDomains = Array.from(
    new Set(
      (allRows ?? [])
        .map((r) => r.sub_domain)
        .filter((d): d is string => Boolean(d) && !CANONICAL_PRIMARY_SPECIALIZATIONS.has(d as string))
    )
  ).sort();
  // current_location is free text typed by the candidate (no fixed taxonomy
  // like industry/language), so the filter options have to come from what's
  // actually on file rather than a hardcoded list -- same reasoning as
  // legacySubDomains above. Exact-match .in() rather than the old .ilike()
  // substring match, matching every other multi-select filter on this page.
  const locationOptions = Array.from(
    new Set(
      (allRows ?? [])
        .map((r) => (r.current_location ?? "").trim())
        .filter((v): v is string => Boolean(v))
    )
  ).sort();
  const statusCounts: Record<string, number> = {};
  const createdByCounts: Record<string, number> = {};
  let newToday = 0;
  let newWTD = 0;
  let newMTD = 0;
  let newLastMonth = 0;
  let recruiterAssessedCount = 0;
  const now = new Date();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Week = Mon-Sun containing today.
  const startOfWeek = new Date(startOfToday);
  const dayOfWeek = (startOfToday.getDay() + 6) % 7; // 0 = Monday
  startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  (allRows ?? []).forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.created_by) createdByCounts[r.created_by] = (createdByCounts[r.created_by] ?? 0) + 1;
    const createdAt = new Date(r.created_at);
    if (createdAt >= startOfToday) newToday += 1;
    if (createdAt >= startOfWeek) newWTD += 1;
    if (createdAt >= startOfMonth) newMTD += 1;
    if (createdAt >= startOfLastMonth && createdAt < startOfMonth) newLastMonth += 1;
    const assessment = r.recruiter_assessment as Record<string, unknown> | null;
    if (assessment && Object.keys(assessment).length > 0) recruiterAssessedCount += 1;
  });
  const totalCount = (allRows ?? []).length;
  const quickApplyCount = createdByCounts["quick_apply"] ?? 0;
  // "Build Your Profile" covers both the current self_registration path and
  // the legacy candidate_self_signup value -- same UI-facing origin, just an
  // older created_by string from before the taxonomy settled.
  const jobPortalCount = (createdByCounts["self_registration"] ?? 0) + (createdByCounts["candidate_self_signup"] ?? 0);
  const recruiterAddedCount = createdByCounts["recruiter_created"] ?? 0;
  const bulkUploadCount = createdByCounts["bulk_resume_upload"] ?? 0;
  const zohoImportCount = createdByCounts["bulk_import"] ?? 0;
  const incompleteCount = (statusCounts["awaiting_input"] ?? 0) + (statusCounts["lead"] ?? 0);

  // Pipeline progress (Submitted / Client Interview / Client Shortlisted /
  // Offer / Placed) now lives on candidate_mandate_links.stage, per mandate
  // -- not candidates.status, which Phase 1 narrowed to profile-lifecycle
  // values only. Counting "distinct candidates with at least one mandate at
  // this stage" here, same as the funnel/KPI tiles below read from it.
  const { data: allStageLinks } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id, stage, date_of_joining");
  const stageCandidateSets: Record<string, Set<string>> = {};
  // "Placed" splits into Joined vs Offered-but-not-joined by whether a join
  // date has actually landed -- both are still stage="placed", so tracked
  // as their own distinct-candidate sets alongside stageCandidateSets.
  const joinedCandidates = new Set<string>();
  const offeredNotJoinedCandidates = new Set<string>();
  (allStageLinks ?? []).forEach((l) => {
    if (!l.stage) return;
    if (!stageCandidateSets[l.stage]) stageCandidateSets[l.stage] = new Set();
    stageCandidateSets[l.stage].add(l.candidate_id);
    if (l.stage === "placed") {
      if (l.date_of_joining) joinedCandidates.add(l.candidate_id);
      else offeredNotJoinedCandidates.add(l.candidate_id);
    }
  });
  const stageCounts: Record<string, number> = {};
  MANDATE_STAGES.forEach((s) => {
    stageCounts[s] = stageCandidateSets[s]?.size ?? 0;
  });
  const joinedCount = joinedCandidates.size;
  const offeredNotJoinedCount = offeredNotJoinedCandidates.size;

  function qs(overrides: Record<string, string | undefined>) {
    // Any filter change resets back to page 1 unless the override is
    // specifically a page-navigation link (which sets `page` itself) --
    // otherwise switching filters could silently land on a now out-of-range page.
    const merged = { ...params, page: undefined, ...overrides };
    const sp = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    const s = sp.toString();
    return s ? `/candidates?${s}` : "/candidates";
  }

  // Renders one removable chip per selected value for a multi-select filter
  // field -- same "remove just this one value" pattern established for
  // sub_domain/role_level, generalized so every multi-select field can reuse
  // it instead of repeating the split/filter/join logic per field.
  function multiValueChips(
    field: string,
    label: string,
    opts?: { tone?: keyof typeof ACTIVE_FILTER_TONE_CLASSES; labels?: Record<string, string> }
  ) {
    const raw = params[field as keyof typeof params] as string | undefined;
    if (!raw) return null;
    return raw
      .split(",")
      .filter(Boolean)
      .map((v) => (
        <ActiveFilterChip
          key={`${field}-${v}`}
          tone={opts?.tone}
          href={qs({
            [field]: raw.split(",").filter((x) => x !== v).join(",") || undefined,
          })}
        >
          {label}: {opts?.labels?.[v] ?? v} ✕
        </ActiveFilterChip>
      ));
  }

  // Whether any filter (basic or advanced) is currently active, so the
  // "Clear all filters" control only shows up when there's actually
  // something to clear.
  const hasAnyFilter = Object.values(params).some((v) => Boolean(v));
  // Keying the <details> panel to the current filter set forces it to
  // remount (and therefore collapse back to closed, its default state)
  // whenever the URL's search params change -- including right after
  // "Clear all filters" navigates back to the bare /candidates route.
  const filtersKey = JSON.stringify(params);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Candidates</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Search, assess, and shortlist your candidate database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/candidates/bulk-upload"
            className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] text-slate-700 dark:text-slate-200 text-[13px] font-medium px-3.5 py-2 shadow-sm flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" /> Bulk upload CVs
          </Link>
          <Link
            href="/candidates/new"
            className="rounded-lg bg-blue-600 hover:bg-blue-500 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] text-white text-[13px] font-medium px-3.5 py-2 shadow-sm"
          >
            + Create candidate
          </Link>
        </div>
      </div>

      {/* Business-critical metrics only, grouped into four labeled rows of
          compact pill "tubes" instead of a flat grid of square cards --
          each row answers one question a recruiter/founder actually asks:
          how many candidates do we have and where from, how fast are we
          adding more, how much recruiter attention has landed, and where
          is everyone in the client pipeline right now. */}
      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-4 mb-3 shadow-ros-sm">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="shrink-0">
            <p className="text-[30px] leading-none font-bold text-slate-900 dark:text-slate-100 tabular-nums">
              {totalCount}
            </p>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-1.5">Total Candidates</p>
            {incompleteCount > 0 && (
              <Link
                href={qs({ incomplete: "1" })}
                className="inline-flex items-center gap-1 text-[10.5px] font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 mt-1.5"
              >
                <AlertTriangle className="w-3 h-3" /> {incompleteCount} need profile completion
              </Link>
            )}
          </div>
          <div className="hidden lg:block w-px self-stretch bg-slate-100 dark:bg-slate-800" />
          <div className="flex-1 flex flex-wrap gap-1.5">
            <MiniStat value={quickApplyCount} label="Job Apply" tone="info" href={qs({ origin: "quick_apply" })} />
            <MiniStat value={jobPortalCount} label="Profile Registrations" tone="accent" href={qs({ origin: "self_registration,candidate_self_signup" })} />
            <MiniStat value={bulkUploadCount} label="Bulk Uploads" tone="warning" href={qs({ origin: "bulk_resume_upload" })} />
            <MiniStat value={zohoImportCount} label="One-Time Upload (Zoho)" tone="neutral" href={qs({ origin: "bulk_import" })} />
            <MiniStat value={recruiterAddedCount} label="Recruiter Created" tone="success" href={qs({ origin: "recruiter_created" })} />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
          <StatSection title="New Additions">
            <MiniStat value={newToday} label="Today" tone="accent" />
            <MiniStat value={newWTD} label="This Week" tone="accent" />
            <MiniStat value={newMTD} label="This Month" tone="accent" />
            <MiniStat value={newLastMonth} label="Last Month" tone="neutral" />
          </StatSection>

          <StatSection title="Recruiter Activity">
            <MiniStat
              value={recruiterAssessedCount}
              label="Recruiter Assessed"
              tone="info"
              title="Candidates with a saved recruiter assessment"
            />
          </StatSection>

          <StatSection title="Client Pipeline Disposition">
            <MiniStat value={stageCounts["submitted"] ?? 0} label="Submitted" tone="info" href={qs({ mandate_stage: "submitted" })} />
            <MiniStat value={stageCounts["client_interview"] ?? 0} label="Client Interview" tone="accent" href={qs({ mandate_stage: "client_interview" })} />
            <MiniStat value={stageCounts["client_shortlisted"] ?? 0} label="Client Shortlisted" tone="success" href={qs({ mandate_stage: "client_shortlisted" })} />
            <MiniStat value={stageCounts["rejected"] ?? 0} label="Client Rejected" tone="danger" href={qs({ mandate_stage: "rejected" })} />
          </StatSection>

          <StatSection title="Offer & Joining">
            <MiniStat value={stageCounts["offer"] ?? 0} label="Client Offers" tone="warning" href={qs({ mandate_stage: "offer" })} />
            <MiniStat value={joinedCount} label="Joined" tone="success" href={qs({ mandate_stage: "placed" })} />
            <MiniStat value={offeredNotJoinedCount} label="Offered, Not Joined" tone="warning" title="Placed stage without a join date on file yet" />
          </StatSection>
        </div>
      </div>

      <form className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-3 mb-3 shadow-ros-sm">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search candidates by name, email, employer..."
            className="flex-1 min-w-[220px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 text-[13px] focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
          />
          {params.category && <input type="hidden" name="category" value={params.category} />}
          {params.status && <input type="hidden" name="status" value={params.status} />}
          {params.location && <input type="hidden" name="location" value={params.location} />}
          {params.secondary_domain && <input type="hidden" name="secondary_domain" value={params.secondary_domain} />}
          {params.current_industry && <input type="hidden" name="current_industry" value={params.current_industry} />}
          {params.previous_industry && <input type="hidden" name="previous_industry" value={params.previous_industry} />}
          {params.origin && <input type="hidden" name="origin" value={params.origin} />}
          {params.incomplete && <input type="hidden" name="incomplete" value={params.incomplete} />}
          {params.from && <input type="hidden" name="from" value={params.from} />}
          {params.to && <input type="hidden" name="to" value={params.to} />}
          {params.recruiter && <input type="hidden" name="recruiter" value={params.recruiter} />}
          {params.placed_only && <input type="hidden" name="placed_only" value={params.placed_only} />}
          {params.language && <input type="hidden" name="language" value={params.language} />}
          {params.b2b_motion && <input type="hidden" name="b2b_motion" value={params.b2b_motion} />}
          {params.b2c_motion && <input type="hidden" name="b2c_motion" value={params.b2c_motion} />}
          {params.source_channel && <input type="hidden" name="source_channel" value={params.source_channel} />}
          <button
            type="submit"
            className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium px-3.5 py-1.5"
          >
            Search
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap mt-3">
          <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide shrink-0">
            Current profile type
          </span>
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              href={qs({ category: c.value || undefined })}
              className={`text-[12px] font-medium px-3 py-1 rounded-full transition-all duration-200 ease-ros ${
                (params.category ?? "") === c.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {c.label}
            </Link>
          ))}
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5 shrink-0" aria-hidden />
          <Link
            href={qs({ incomplete: params.incomplete ? undefined : "1" })}
            className={`text-[12px] font-medium px-3 py-1 rounded-full transition-all duration-200 ease-ros ${
              params.incomplete
                ? "bg-amber-100 text-amber-800 ring-1 ring-amber-300"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            ⚠ Incomplete profiles
          </Link>
          {multiValueChips("status", "Status", { labels: STATUS_LABEL })}
          {multiValueChips("mandate_stage", "Pipeline stage", { tone: "success", labels: STAGE_LABEL })}
          {params.sub_domain &&
            params.sub_domain.split(",").filter(Boolean).map((v) => (
              <ActiveFilterChip
                key={`sub_domain-${v}`}
                href={qs({
                  sub_domain:
                    params.sub_domain!.split(",").filter((x) => x !== v).join(",") || undefined,
                })}
              >
                Specialization: {v} ✕
              </ActiveFilterChip>
            ))}
          {params.role_level &&
            params.role_level.split(",").filter(Boolean).map((v) => (
              <ActiveFilterChip
                key={`role_level-${v}`}
                href={qs({
                  role_level:
                    params.role_level!.split(",").filter((x) => x !== v).join(",") || undefined,
                })}
              >
                Role level: {v} ✕
              </ActiveFilterChip>
            ))}
          {multiValueChips("location", "Current location")}
          {multiValueChips("secondary_domain", "Secondary domain")}
          {multiValueChips("current_industry", "Current industry", { tone: "success" })}
          {multiValueChips("previous_industry", "Previous industry")}
          {multiValueChips("origin", "Origin", { tone: "warning", labels: ORIGIN_LABEL })}
          {multiValueChips("source_channel", "Source", { tone: "warning" })}
          {multiValueChips("language", "Language")}
          {multiValueChips("b2b_motion", "B2B Motion")}
          {multiValueChips("b2c_motion", "B2C Motion")}
          {multiValueChips("notice_period", "Days to join")}
          {multiValueChips("employment_status", "Employment status")}
          {multiValueChips("highest_qualification", "Qualification")}
          {multiValueChips("work_mode", "Work mode")}
          {multiValueChips("recommendation", "Recommendation")}
          {multiValueChips("job_stability", "Job stability")}
          {multiValueChips("relocation_verified", "Relocation verified")}
          {(params.from || params.to) && (
            <ActiveFilterChip href={qs({ from: undefined, to: undefined })}>
              Added: {params.from ?? "…"} → {params.to ?? "…"} ✕
            </ActiveFilterChip>
          )}
          {params.recruiter && (
            <ActiveFilterChip href={qs({ recruiter: undefined, placed_only: undefined })}>
              {params.placed_only ? "Placed by" : "Linked by"} {recruiterName ?? "recruiter"} ✕
            </ActiveFilterChip>
          )}

          {hasAnyFilter && (
            <Link
              href="/candidates"
              className="text-[12px] font-medium px-3 py-1 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-200 ease-ros"
            >
              Clear all filters
            </Link>
          )}

          <details key={filtersKey} className="ml-auto group">
            <summary className="list-none flex items-center gap-1 text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 cursor-pointer px-2 py-1">
              <SlidersHorizontal className="w-3 h-3" /> More filters
            </summary>
            <div className="flex flex-col gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <FilterGroup title="Profile & Specialization">
                  <FilterField label="Current location">
                    <MultiSelectFilter
                      name="location"
                      label="Current location"
                      defaultValue={params.location}
                      options={locationOptions}
                    />
                  </FilterField>
                  <FilterField label="Primary Specialization">
                    <MultiSelectFilter
                      name="sub_domain"
                      label="Primary Specialization"
                      defaultValue={params.sub_domain}
                      groups={[
                        ...PRIMARY_SPECIALIZATION_GROUPS,
                        ...(legacySubDomains.length > 0
                          ? [{ group: "Other / legacy values", options: legacySubDomains }]
                          : []),
                      ]}
                    />
                  </FilterField>
                  <FilterField label="Secondary specialization">
                    <MultiSelectFilter
                      name="secondary_domain"
                      label="Secondary specialization"
                      defaultValue={params.secondary_domain}
                      groups={secondarySpecializationGroups()}
                    />
                  </FilterField>
                  <FilterField label="Current industry">
                    <MultiSelectFilter
                      name="current_industry"
                      label="Current industry"
                      defaultValue={params.current_industry}
                      options={[...industryOptions]}
                    />
                  </FilterField>
                  <FilterField label="Previous industry">
                    <MultiSelectFilter
                      name="previous_industry"
                      label="Previous industry"
                      defaultValue={params.previous_industry}
                      options={[...industryOptions]}
                    />
                  </FilterField>
                  <FilterField label="Languages known">
                    <MultiSelectFilter
                      name="language"
                      label="Languages known"
                      defaultValue={params.language}
                      options={[...languageOptions]}
                    />
                  </FilterField>
                  <FilterField label="B2B Sales Motion">
                    <MultiSelectFilter
                      name="b2b_motion"
                      label="B2B Sales Motion"
                      defaultValue={params.b2b_motion}
                      options={[...b2bSalesMotionTypeOptions]}
                    />
                  </FilterField>
                  <FilterField label="B2C Sales Motion">
                    <MultiSelectFilter
                      name="b2c_motion"
                      label="B2C Sales Motion"
                      defaultValue={params.b2c_motion}
                      options={[...b2cSalesMotionOptions]}
                    />
                  </FilterField>
                </FilterGroup>

                <FilterGroup title="Compensation & Availability">
                  <FilterField label="Min fixed CTC (L)">
                    <input name="min_ctc" type="number" defaultValue={params.min_ctc} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
                  </FilterField>
                  <FilterField label="Max fixed CTC (L)">
                    <input name="max_ctc" type="number" defaultValue={params.max_ctc} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
                  </FilterField>
                  <FilterField label="Min experience">
                    <input name="min_exp" type="number" defaultValue={params.min_exp} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
                  </FilterField>
                  <FilterField label="Days to join">
                    <MultiSelectFilter
                      name="notice_period"
                      label="Days to join"
                      defaultValue={params.notice_period}
                      options={[...NOTICE_PERIODS]}
                    />
                  </FilterField>
                  <FilterField label="Employment status">
                    <MultiSelectFilter
                      name="employment_status"
                      label="Employment status"
                      defaultValue={params.employment_status}
                      options={[...employmentStatusOptions]}
                    />
                  </FilterField>
                  <FilterField label="Highest qualification">
                    <MultiSelectFilter
                      name="highest_qualification"
                      label="Highest qualification"
                      defaultValue={params.highest_qualification}
                      options={[...QUALIFICATION_OPTIONS]}
                    />
                  </FilterField>
                  <FilterField label="Work mode">
                    <MultiSelectFilter
                      name="work_mode"
                      label="Work mode"
                      defaultValue={params.work_mode}
                      options={[...workModeOptions]}
                    />
                  </FilterField>
                  <FilterField label="Open to relocation">
                    <select
                      name="open_to_relocation"
                      defaultValue={params.open_to_relocation ?? ""}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      <option value="Yes">Yes</option>
                      <option value="No">No</option>
                    </select>
                  </FilterField>
                  <FilterField label="Role level">
                    <MultiSelectFilter
                      name="role_level"
                      label="Role level"
                      defaultValue={params.role_level}
                      options={[...roleLevelOptions]}
                    />
                  </FilterField>
                  <FilterField label="Role type">
                    <select
                      name="role_type"
                      defaultValue={params.role_type ?? ""}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      {ROLE_TYPE_FILTER_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </FilterField>
                </FilterGroup>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <FilterGroup title="Pipeline & Source">
                  <FilterField label="Status">
                    <MultiSelectFilter
                      name="status"
                      label="Status"
                      defaultValue={params.status}
                      options={Object.keys(STATUS_LABEL)}
                      labels={STATUS_LABEL}
                    />
                  </FilterField>
                  <FilterField label="Pipeline stage">
                    <MultiSelectFilter
                      name="mandate_stage"
                      label="Pipeline stage"
                      defaultValue={params.mandate_stage}
                      options={[...MANDATE_STAGES]}
                      labels={STAGE_LABEL}
                    />
                  </FilterField>
                  <FilterField label="Origin">
                    <MultiSelectFilter
                      name="origin"
                      label="Origin"
                      defaultValue={params.origin}
                      options={Object.keys(ORIGIN_LABEL)}
                      labels={ORIGIN_LABEL}
                    />
                  </FilterField>
                  <FilterField label="Source channel">
                    <MultiSelectFilter
                      name="source_channel"
                      label="Source channel"
                      defaultValue={params.source_channel}
                      options={[...SOURCE_CHANNEL_OPTIONS]}
                    />
                  </FilterField>
                  <FilterField label="Recruiter recommendation">
                    <MultiSelectFilter
                      name="recommendation"
                      label="Recruiter recommendation"
                      defaultValue={params.recommendation}
                      options={[...RECOMMENDATIONS]}
                    />
                  </FilterField>
                </FilterGroup>

                <FilterGroup title="Assessment scores">
                  <FilterField label="Job stability">
                    <MultiSelectFilter
                      name="job_stability"
                      label="Job stability"
                      defaultValue={params.job_stability}
                      options={[...JOB_STABILITY_OPTIONS]}
                    />
                  </FilterField>
                  <FilterField label="Relocation — verified">
                    <MultiSelectFilter
                      name="relocation_verified"
                      label="Relocation — verified"
                      defaultValue={params.relocation_verified}
                      options={[...RELOCATION_VERIFIED_OPTIONS]}
                    />
                  </FilterField>
                  <FilterField label="Min communication score">
                    <select
                      name="min_communication"
                      defaultValue={params.min_communication ?? ""}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      {SCORE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}+
                        </option>
                      ))}
                    </select>
                  </FilterField>
                  <FilterField label="Min confidence score">
                    <select
                      name="min_confidence"
                      defaultValue={params.min_confidence ?? ""}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      {SCORE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}+
                        </option>
                      ))}
                    </select>
                  </FilterField>
                  <FilterField label="Min coachability score">
                    <select
                      name="min_coachability"
                      defaultValue={params.min_coachability ?? ""}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                    >
                      <option value="">Any</option>
                      {SCORE_OPTIONS.map((n) => (
                        <option key={n} value={n}>
                          {n}+
                        </option>
                      ))}
                    </select>
                  </FilterField>
                </FilterGroup>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="submit" className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium px-3 py-1.5">
                  Apply
                </button>
                {hasAnyFilter && (
                  <Link
                    href="/candidates"
                    className="text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 px-3 py-1.5"
                  >
                    Clear all filters
                  </Link>
                )}
              </div>
            </div>
          </details>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4">Error loading candidates: {error.message}</p>
      )}

      <CandidatesTable
        candidates={candidatesWithResumeUrls as never}
        openMandates={openMandates ?? []}
        mandateLinksByCandidate={mandateLinksByCandidate}
        totalCount={totalFiltered}
        rangeStart={rangeStart}
        rangeEnd={rangeEnd}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Page {pageNum} of {totalPages}
          </p>
          <div className="flex items-center gap-1.5">
            <Link
              href={qs({ page: pageNum > 1 ? String(pageNum - 1) : undefined })}
              aria-disabled={pageNum <= 1}
              className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 ${
                pageNum <= 1
                  ? "pointer-events-none opacity-40 text-slate-400"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              ← Prev
            </Link>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - pageNum) <= 2)
              .reduce<(number | "ellipsis")[]>((acc, p, i, arr) => {
                if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("ellipsis");
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === "ellipsis" ? (
                  <span key={`e${i}`} className="text-[12px] text-slate-400 px-1">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={qs({ page: p === 1 ? undefined : String(p) })}
                    className={`text-[12.5px] font-medium w-8 h-8 flex items-center justify-center rounded-lg ${
                      p === pageNum
                        ? "bg-blue-600 text-white"
                        : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    {p}
                  </Link>
                )
              )}
            <Link
              href={qs({ page: pageNum < totalPages ? String(pageNum + 1) : undefined })}
              aria-disabled={pageNum >= totalPages}
              className={`text-[12.5px] font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 ${
                pageNum >= totalPages
                  ? "pointer-events-none opacity-40 text-slate-400"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              Next →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
