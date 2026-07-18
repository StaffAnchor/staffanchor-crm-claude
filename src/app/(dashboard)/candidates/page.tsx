import Link from "next/link";
import {
  Users,
  Sparkles,
  Eye,
  Star,
  Send,
  Trophy,
  SlidersHorizontal,
  Zap,
  Database,
  AlertTriangle,
  Upload,
} from "lucide-react";
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
} from "@/lib/candidate-options";

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
import { StatTile } from "@/components/ui/stat-tile";

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

const ORIGIN_LABEL: Record<string, string> = {
  quick_apply: "Job Quick Apply",
  self_registration: "Build Your Profile",
  recruiter_created: "Recruiter Created (one at a time)",
  bulk_resume_upload: "Bulk CV Upload",
};

// ROS: a hiring funnel is inherently one progression, not six unrelated
// categories -- so it reads calmer as one accent color deepening toward
// the end of the pipeline (rainbow bars implied unrelated categories).
const FUNNEL_STAGES: { key: string; label: string; color: string }[] = [
  { key: "lead", label: "Lead", color: "bg-slate-300 dark:bg-slate-600" },
  { key: "awaiting_input", label: "Awaiting Input", color: "bg-amber-300" },
  { key: "registered", label: "Registered", color: "bg-sky-300" },
  { key: "under_review", label: "Under Review", color: "bg-blue-300" },
  { key: "shortlisted", label: "Shortlisted", color: "bg-blue-400" },
  { key: "submitted", label: "Submitted", color: "bg-blue-500" },
  { key: "client_interview", label: "Interview", color: "bg-blue-600" },
  { key: "offer_placed", label: "Offer / Placed", color: "bg-emerald-500" },
];

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
    if (params.status) qq = qq.eq("status", params.status);
    if (params.min_ctc) qq = qq.gte("current_fixed_ctc", Number(params.min_ctc));
    if (params.max_ctc) qq = qq.lte("current_fixed_ctc", Number(params.max_ctc));
    if (params.min_exp) qq = qq.gte("total_experience_years", Number(params.min_exp));
    if (params.sub_domain) qq = qq.eq("sub_domain", params.sub_domain);
    if (params.location) qq = qq.ilike("current_location", `%${params.location}%`);
    if (params.secondary_domain) qq = qq.contains("secondary_sub_domains", [params.secondary_domain]);
    // segment_data.languages_known / .b2b_sales_motion_type are jsonb arrays
    // nested inside the segment_data column (not their own top-level array
    // columns like secondary_sub_domains above), so containment needs the
    // 'cs' (contains) jsonb operator against the JSON path expression rather
    // than .contains(). b2c motion lives at segment_data.motion (mirrors the
    // key ApplyForm.tsx actually writes -- see jobs-staffanchor ApplyForm.tsx).
    if (params.language) qq = qq.filter("segment_data->languages_known", "cs", JSON.stringify([params.language]));
    if (params.b2b_motion) qq = qq.filter("segment_data->b2b_sales_motion_type", "cs", JSON.stringify([params.b2b_motion]));
    if (params.b2c_motion) qq = qq.filter("segment_data->motion", "cs", JSON.stringify([params.b2c_motion]));
    if (params.source_channel) qq = qq.eq("source_channel", params.source_channel);
    if (params.current_industry) qq = qq.eq("current_industry", params.current_industry);
    if (params.previous_industry) {
      qq = qq.contains("industries", [params.previous_industry]).neq("current_industry", params.previous_industry);
    }
    if (params.origin) qq = qq.eq("created_by", params.origin);
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
    if (params.notice_period) qq = qq.eq("notice_period", params.notice_period);
    if (params.employment_status) qq = qq.eq("current_employment_status", params.employment_status);
    if (params.highest_qualification) qq = qq.eq("highest_qualification", params.highest_qualification);
    if (params.work_mode) qq = qq.eq("work_mode", params.work_mode);
    if (params.open_to_relocation) qq = qq.eq("open_to_relocation", params.open_to_relocation);
    if (params.role_level) qq = qq.eq("segment_data->>role_level", params.role_level);
    if (params.role_type) qq = qq.eq("segment_data->>role_type", params.role_type);
    if (params.recommendation) {
      qq = qq.eq("recruiter_assessment->>overall_recommendation", params.recommendation);
    }
    if (params.job_stability) {
      qq = qq.eq("recruiter_assessment->>job_stability", params.job_stability);
    }
    if (params.relocation_verified) {
      qq = qq.eq("recruiter_assessment->>relocation_verified", params.relocation_verified);
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
  const { data: allRows } = await supabase.from("candidates").select("sub_domain, status, created_at, created_by");
  const subDomains = Array.from(new Set((allRows ?? []).map((r) => r.sub_domain).filter(Boolean))).sort();
  const statusCounts: Record<string, number> = {};
  const createdByCounts: Record<string, number> = {};
  let newToday = 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  (allRows ?? []).forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (r.created_by) createdByCounts[r.created_by] = (createdByCounts[r.created_by] ?? 0) + 1;
    if (new Date(r.created_at) >= startOfToday) newToday += 1;
  });
  const totalCount = (allRows ?? []).length;
  const quickApplyCount = createdByCounts["quick_apply"] ?? 0;
  const jobPortalCount = createdByCounts["self_registration"] ?? 0;
  const recruiterAddedCount = createdByCounts["recruiter_created"] ?? 0;
  const bulkUploadCount = createdByCounts["bulk_resume_upload"] ?? 0;
  const incompleteCount = (statusCounts["awaiting_input"] ?? 0) + (statusCounts["lead"] ?? 0);

  const funnelCounts: Record<string, number> = {
    lead: statusCounts["lead"] ?? 0,
    awaiting_input: statusCounts["awaiting_input"] ?? 0,
    registered: statusCounts["registered"] ?? 0,
    under_review: statusCounts["under_review"] ?? 0,
    shortlisted: statusCounts["shortlisted"] ?? 0,
    submitted: statusCounts["submitted"] ?? 0,
    client_interview: statusCounts["client_interview"] ?? 0,
    offer_placed: (statusCounts["offer"] ?? 0) + (statusCounts["placed"] ?? 0),
  };
  const funnelMax = Math.max(1, ...Object.values(funnelCounts));

  // ROS: neutral cards + one restrained accent (Total candidates, the
  // single most important number in the row) instead of ten differently
  // colored solid pills -- calmer, less "control panel," per the redesign.
  const statTiles = [
    { label: "Total candidates", value: totalCount, icon: Users, accent: true },
    { label: "New today", value: newToday, icon: Sparkles },
    { label: "Under review", value: statusCounts["under_review"] ?? 0, icon: Eye, href: "/candidates?status=under_review" },
    { label: "Shortlisted", value: statusCounts["shortlisted"] ?? 0, icon: Star, href: "/candidates?status=shortlisted" },
    { label: "Submitted", value: statusCounts["submitted"] ?? 0, icon: Send, href: "/candidates?status=submitted" },
    { label: "Placed", value: statusCounts["placed"] ?? 0, icon: Trophy, href: "/candidates?status=placed" },
    { label: "Job Quick Apply", value: quickApplyCount, icon: Zap, href: qs({ origin: "quick_apply" }) },
    { label: "Build Your Profile", value: jobPortalCount, icon: Database, href: qs({ origin: "self_registration" }) },
    { label: "Recruiter Created", value: recruiterAddedCount, icon: Users, href: qs({ origin: "recruiter_created" }) },
    { label: "Bulk CV Upload", value: bulkUploadCount, icon: Upload, href: qs({ origin: "bulk_resume_upload" }) },
    { label: "Incomplete profiles", value: incompleteCount, icon: AlertTriangle, href: qs({ incomplete: "1" }) },
  ];

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

      {/* Soft canvas backdrop -- the tiles read as one calm surface instead
          of ten separately-boxed panels floating on the page background. */}
      <div className="bg-slate-50/60 dark:bg-slate-800/50 rounded-ros-lg p-2 mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {statTiles.map((k) => {
            const Icon = k.icon;
            const tile = (
              <StatTile
                label={k.label}
                value={k.value}
                icon={<Icon className="w-4 h-4" strokeWidth={2} />}
                accent={k.accent}
                className={k.href ? "cursor-pointer" : undefined}
              />
            );
            return k.href ? (
              <Link key={k.label} href={k.href}>
                {tile}
              </Link>
            ) : (
              <div key={k.label}>{tile}</div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg px-4 py-3 mb-3 shadow-ros-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Hiring pipeline
          </p>
        </div>
        <div className="flex items-center gap-3">
          {FUNNEL_STAGES.map((stage, i) => {
            const count = funnelCounts[stage.key] ?? 0;
            const widthPct = Math.max(6, (count / funnelMax) * 100);
            return (
              <Link
                key={stage.key}
                href={`/candidates?status=${stage.key === "offer_placed" ? "offer" : stage.key}`}
                className="group flex-1 flex items-center gap-2"
                title={`${count} candidate${count === 1 ? "" : "s"} · ${stage.label}`}
              >
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.color} opacity-80 group-hover:opacity-100 transition-all duration-200 ease-ros`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums shrink-0">{count}</span>
                <span className="text-[10.5px] text-slate-500 dark:text-slate-400 shrink-0 hidden lg:inline">{stage.label}</span>
                {i < FUNNEL_STAGES.length - 1 && (
                  <span className="hidden" aria-hidden>
                    →
                  </span>
                )}
              </Link>
            );
          })}
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

        <div className="flex items-center gap-1.5 flex-wrap mt-3">
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
          {params.status && (
            <Link
              href={qs({ status: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Status: {STATUS_LABEL[params.status] ?? params.status} ✕
            </Link>
          )}
          {params.location && (
            <Link
              href={qs({ location: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Location: {params.location} ✕
            </Link>
          )}
          {params.secondary_domain && (
            <Link
              href={qs({ secondary_domain: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Secondary domain: {params.secondary_domain} ✕
            </Link>
          )}
          {params.current_industry && (
            <Link
              href={qs({ current_industry: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
            >
              Current industry: {params.current_industry} ✕
            </Link>
          )}
          {params.previous_industry && (
            <Link
              href={qs({ previous_industry: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Previous industry: {params.previous_industry} ✕
            </Link>
          )}
          {params.origin && (
            <Link
              href={qs({ origin: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200"
            >
              Origin: {ORIGIN_LABEL[params.origin] ?? params.origin} ✕
            </Link>
          )}
          {params.source_channel && (
            <Link
              href={qs({ source_channel: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-orange-50 text-orange-700 ring-1 ring-orange-200"
            >
              Source: {params.source_channel} ✕
            </Link>
          )}
          {params.language && (
            <Link
              href={qs({ language: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Language: {params.language} ✕
            </Link>
          )}
          {params.b2b_motion && (
            <Link
              href={qs({ b2b_motion: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              B2B Motion: {params.b2b_motion} ✕
            </Link>
          )}
          {params.b2c_motion && (
            <Link
              href={qs({ b2c_motion: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              B2C Motion: {params.b2c_motion} ✕
            </Link>
          )}
          {(params.from || params.to) && (
            <Link
              href={qs({ from: undefined, to: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Added: {params.from ?? "…"} → {params.to ?? "…"} ✕
            </Link>
          )}
          {params.recruiter && (
            <Link
              href={qs({ recruiter: undefined, placed_only: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              {params.placed_only ? "Placed by" : "Linked by"} {recruiterName ?? "recruiter"} ✕
            </Link>
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
            <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue={params.status ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">All</option>
                  {Object.entries(STATUS_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Min fixed CTC (L)</label>
                <input name="min_ctc" type="number" defaultValue={params.min_ctc} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Max fixed CTC (L)</label>
                <input name="max_ctc" type="number" defaultValue={params.max_ctc} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Min experience</label>
                <input name="min_exp" type="number" defaultValue={params.min_exp} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Recruiter recommendation</label>
                <select
                  name="recommendation"
                  defaultValue={params.recommendation ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {RECOMMENDATIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Sub-domain</label>
                <select
                  name="sub_domain"
                  defaultValue={params.sub_domain ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {subDomains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Current industry</label>
                <select
                  name="current_industry"
                  defaultValue={params.current_industry ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {industryOptions.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Previous industry</label>
                <select
                  name="previous_industry"
                  defaultValue={params.previous_industry ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {industryOptions.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Origin</label>
                <select
                  name="origin"
                  defaultValue={params.origin ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {Object.entries(ORIGIN_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Secondary specialization</label>
                <select
                  name="secondary_domain"
                  defaultValue={params.secondary_domain ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {subDomains.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Languages known</label>
                <select
                  name="language"
                  defaultValue={params.language ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {languageOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">B2B Sales Motion</label>
                <select
                  name="b2b_motion"
                  defaultValue={params.b2b_motion ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {b2bSalesMotionTypeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">B2C Sales Motion</label>
                <select
                  name="b2c_motion"
                  defaultValue={params.b2c_motion ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {b2cSalesMotionOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Source channel</label>
                <select
                  name="source_channel"
                  defaultValue={params.source_channel ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {SOURCE_CHANNEL_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Days to join</label>
                <select
                  name="notice_period"
                  defaultValue={params.notice_period ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {NOTICE_PERIODS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Employment status</label>
                <select
                  name="employment_status"
                  defaultValue={params.employment_status ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {employmentStatusOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Highest qualification</label>
                <select
                  name="highest_qualification"
                  defaultValue={params.highest_qualification ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {QUALIFICATION_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Work mode</label>
                <select
                  name="work_mode"
                  defaultValue={params.work_mode ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {workModeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Open to relocation</label>
                <select
                  name="open_to_relocation"
                  defaultValue={params.open_to_relocation ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Role level</label>
                <select
                  name="role_level"
                  defaultValue={params.role_level ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {roleLevelOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Role type</label>
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
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Job stability</label>
                <select
                  name="job_stability"
                  defaultValue={params.job_stability ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {JOB_STABILITY_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Relocation — verified</label>
                <select
                  name="relocation_verified"
                  defaultValue={params.relocation_verified ?? ""}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12px]"
                >
                  <option value="">Any</option>
                  {RELOCATION_VERIFIED_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Min communication score</label>
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
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Min confidence score</label>
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
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Min coachability score</label>
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
              </div>
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
