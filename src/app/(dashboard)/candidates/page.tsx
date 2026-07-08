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
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesTable from "./candidates-table";
import { industryOptions } from "@/lib/candidate-options";

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
  self_registration: "Job Portal — Build Your Profile",
  recruiter_created: "Recruiter Created",
};

const FUNNEL_STAGES: { key: string; label: string; color: string }[] = [
  { key: "lead_registered", label: "New", color: "bg-slate-400" },
  { key: "under_review", label: "Under Review", color: "bg-violet-400" },
  { key: "shortlisted", label: "Shortlisted", color: "bg-teal-400" },
  { key: "submitted", label: "Submitted", color: "bg-indigo-400" },
  { key: "client_interview", label: "Interview", color: "bg-cyan-400" },
  { key: "offer_placed", label: "Offer / Placed", color: "bg-emerald-400" },
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
};

export default async function CandidatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("candidates")
    .select(
      "id, full_name, email, phone, current_location, current_employer, current_job_title, category, sub_domain, current_industry, industries, total_experience_years, current_fixed_ctc, notice_period, current_employment_status, status, created_by, recruiter_assessment, segment_data, resume_file_url, ai_summary, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (params.q) {
    query = query.or(
      `full_name.ilike.%${params.q}%,email.ilike.%${params.q}%,current_employer.ilike.%${params.q}%`
    );
  }
  if (params.category) query = query.eq("category", params.category);
  if (params.status) query = query.eq("status", params.status);
  if (params.min_ctc) query = query.gte("current_fixed_ctc", Number(params.min_ctc));
  if (params.max_ctc) query = query.lte("current_fixed_ctc", Number(params.max_ctc));
  if (params.min_exp) query = query.gte("total_experience_years", Number(params.min_exp));
  if (params.sub_domain) query = query.eq("sub_domain", params.sub_domain);
  if (params.location) query = query.ilike("current_location", `%${params.location}%`);
  if (params.secondary_domain) query = query.contains("secondary_sub_domains", [params.secondary_domain]);
  if (params.current_industry) query = query.eq("current_industry", params.current_industry);
  if (params.previous_industry) {
    query = query.contains("industries", [params.previous_industry]).neq("current_industry", params.previous_industry);
  }
  if (params.origin) query = query.eq("created_by", params.origin);
  if (params.incomplete) query = query.in("status", ["awaiting_input", "lead"]);
  if (params.from) query = query.gte("created_at", params.from);
  if (params.to) query = query.lte("created_at", `${params.to}T23:59:59.999`);
  if (params.recruiter) {
    let linkQuery = supabase.from("candidate_mandate_links").select("candidate_id").eq("added_by", params.recruiter);
    if (params.placed_only) linkQuery = linkQuery.eq("stage", "placed");
    const { data: recruiterLinks } = await linkQuery;
    const candidateIds = Array.from(new Set((recruiterLinks ?? []).map((l) => l.candidate_id)));
    query = query.in("id", candidateIds.length ? candidateIds : ["00000000-0000-0000-0000-000000000000"]);
  }
  if (params.notice_period) query = query.eq("notice_period", params.notice_period);
  if (params.recommendation) {
    query = query.eq("recruiter_assessment->>overall_recommendation", params.recommendation);
  }
  if (params.job_stability) {
    query = query.eq("recruiter_assessment->>job_stability", params.job_stability);
  }
  if (params.relocation_verified) {
    query = query.eq("recruiter_assessment->>relocation_verified", params.relocation_verified);
  }
  if (params.min_communication) {
    query = query.gte("recruiter_assessment->>communication_score", params.min_communication);
  }
  if (params.min_confidence) {
    query = query.gte("recruiter_assessment->>confidence_score", params.min_confidence);
  }
  if (params.min_coachability) {
    query = query.gte("recruiter_assessment->>coachability_score", params.min_coachability);
  }

  const { data: candidates, error } = await query;

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

  const { data: subDomainRows } = await supabase
    .from("candidates")
    .select("sub_domain")
    .not("sub_domain", "is", null);
  const subDomains = Array.from(new Set((subDomainRows ?? []).map((r) => r.sub_domain).filter(Boolean))).sort();

  const { data: allRows } = await supabase.from("candidates").select("status, created_at, created_by");
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
  const incompleteCount = (statusCounts["awaiting_input"] ?? 0) + (statusCounts["lead"] ?? 0);

  const funnelCounts: Record<string, number> = {
    lead_registered: (statusCounts["lead"] ?? 0) + (statusCounts["registered"] ?? 0),
    under_review: statusCounts["under_review"] ?? 0,
    shortlisted: statusCounts["shortlisted"] ?? 0,
    submitted: statusCounts["submitted"] ?? 0,
    client_interview: statusCounts["client_interview"] ?? 0,
    offer_placed: (statusCounts["offer"] ?? 0) + (statusCounts["placed"] ?? 0),
  };
  const funnelMax = Math.max(1, ...Object.values(funnelCounts));

  const kpis = [
    { label: "Total candidates", value: totalCount, icon: Users, accent: "border-slate-300", iconColor: "text-slate-500" },
    { label: "New today", value: newToday, icon: Sparkles, accent: "border-blue-300", iconColor: "text-blue-500" },
    { label: "Under review", value: statusCounts["under_review"] ?? 0, icon: Eye, accent: "border-violet-300", iconColor: "text-violet-500", href: "/candidates?status=under_review" },
    { label: "Shortlisted", value: statusCounts["shortlisted"] ?? 0, icon: Star, accent: "border-teal-300", iconColor: "text-teal-500", href: "/candidates?status=shortlisted" },
    { label: "Submitted", value: statusCounts["submitted"] ?? 0, icon: Send, accent: "border-indigo-300", iconColor: "text-indigo-500", href: "/candidates?status=submitted" },
    { label: "Placed", value: statusCounts["placed"] ?? 0, icon: Trophy, accent: "border-emerald-300", iconColor: "text-emerald-500", href: "/candidates?status=placed" },
  ];

  function qs(overrides: Record<string, string | undefined>) {
    const merged = { ...params, ...overrides };
    const sp = new URLSearchParams();
    Object.entries(merged).forEach(([k, v]) => {
      if (v) sp.set(k, v);
    });
    const s = sp.toString();
    return s ? `/candidates?${s}` : "/candidates";
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight">Candidates</h1>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Search, assess, and shortlist your candidate database
          </p>
        </div>
        <Link
          href="/candidates/new"
          className="rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-white text-[13px] font-medium px-3.5 py-2 shadow-sm"
        >
          + Create candidate
        </Link>
      </div>

      <div className="grid grid-cols-6 gap-2.5 mb-3">
        {kpis.map((k) => {
          const Icon = k.icon;
          const content = (
            <div
              className={`flex items-center gap-2.5 bg-white border-l-[3px] ${k.accent} border-y border-r border-slate-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150`}
            >
              <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
                <Icon className={`w-4 h-4 ${k.iconColor}`} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{k.value}</p>
                <p className="text-[11px] text-slate-500 truncate">{k.label}</p>
              </div>
            </div>
          );
          return k.href ? (
            <Link key={k.label} href={k.href}>
              {content}
            </Link>
          ) : (
            <div key={k.label}>{content}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-4 gap-2.5 mb-3">
        <Link
          href={qs({ origin: "quick_apply" })}
          className="flex items-center gap-2.5 bg-white border-l-[3px] border-blue-300 border-y border-r border-slate-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
            <Zap className="w-4 h-4 text-blue-500" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{quickApplyCount}</p>
            <p className="text-[11px] text-slate-500 truncate">Job Quick Apply</p>
          </div>
        </Link>
        <Link
          href={qs({ origin: "self_registration" })}
          className="flex items-center gap-2.5 bg-white border-l-[3px] border-indigo-300 border-y border-r border-slate-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
            <Database className="w-4 h-4 text-indigo-500" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{jobPortalCount}</p>
            <p className="text-[11px] text-slate-500 truncate">Job Portal — Build Your Profile</p>
          </div>
        </Link>
        <Link
          href={qs({ origin: "recruiter_created" })}
          className="flex items-center gap-2.5 bg-white border-l-[3px] border-violet-300 border-y border-r border-slate-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
            <Users className="w-4 h-4 text-violet-500" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{recruiterAddedCount}</p>
            <p className="text-[11px] text-slate-500 truncate">Recruiter Created</p>
          </div>
        </Link>
        <Link
          href={qs({ incomplete: "1" })}
          className="flex items-center gap-2.5 bg-white border-l-[3px] border-amber-300 border-y border-r border-slate-200 rounded-lg px-3 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
        >
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-500" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">{incompleteCount}</p>
            <p className="text-[11px] text-slate-500 truncate">Incomplete profiles — need a nudge</p>
          </div>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-3 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
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
                href={
                  stage.key === "lead_registered"
                    ? "/candidates"
                    : `/candidates?status=${stage.key === "offer_placed" ? "offer" : stage.key}`
                }
                className="group flex-1 flex items-center gap-2"
                title={`${count} candidate${count === 1 ? "" : "s"} · ${stage.label}`}
              >
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${stage.color} opacity-80 group-hover:opacity-100 transition-all duration-200`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="text-[12px] font-semibold text-slate-900 tabular-nums shrink-0">{count}</span>
                <span className="text-[10.5px] text-slate-500 shrink-0 hidden lg:inline">{stage.label}</span>
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

      <form className="bg-white border border-slate-200 rounded-xl p-3 mb-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search candidates by name, email, employer..."
            className="flex-1 min-w-[220px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
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
              className={`text-[12px] font-medium px-3 py-1 rounded-full transition-colors ${
                (params.category ?? "") === c.value
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {c.label}
            </Link>
          ))}
          <Link
            href={qs({ incomplete: params.incomplete ? undefined : "1" })}
            className={`text-[12px] font-medium px-3 py-1 rounded-full transition-colors ${
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

          <details className="ml-auto group">
            <summary className="list-none flex items-center gap-1 text-[12px] text-slate-500 hover:text-slate-800 cursor-pointer px-2 py-1">
              <SlidersHorizontal className="w-3 h-3" /> More filters
            </summary>
            <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Status</label>
                <select
                  name="status"
                  defaultValue={params.status ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Min fixed CTC (L)</label>
                <input name="min_ctc" type="number" defaultValue={params.min_ctc} className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Max fixed CTC (L)</label>
                <input name="max_ctc" type="number" defaultValue={params.max_ctc} className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Min experience</label>
                <input name="min_exp" type="number" defaultValue={params.min_exp} className="w-20 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]" />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Recruiter recommendation</label>
                <select
                  name="recommendation"
                  defaultValue={params.recommendation ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Sub-domain</label>
                <select
                  name="sub_domain"
                  defaultValue={params.sub_domain ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Current industry</label>
                <select
                  name="current_industry"
                  defaultValue={params.current_industry ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Previous industry</label>
                <select
                  name="previous_industry"
                  defaultValue={params.previous_industry ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Origin</label>
                <select
                  name="origin"
                  defaultValue={params.origin ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Days to join</label>
                <select
                  name="notice_period"
                  defaultValue={params.notice_period ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Job stability</label>
                <select
                  name="job_stability"
                  defaultValue={params.job_stability ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Relocation — verified</label>
                <select
                  name="relocation_verified"
                  defaultValue={params.relocation_verified ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Min communication score</label>
                <select
                  name="min_communication"
                  defaultValue={params.min_communication ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Min confidence score</label>
                <select
                  name="min_confidence"
                  defaultValue={params.min_confidence ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Min coachability score</label>
                <select
                  name="min_coachability"
                  defaultValue={params.min_coachability ?? ""}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]"
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
            </div>
          </details>
        </div>
      </form>

      {error && (
        <p className="text-sm text-red-600 mb-4">Error loading candidates: {error.message}</p>
      )}

      <CandidatesTable candidates={(candidates ?? []) as never} openMandates={openMandates ?? []} />
    </div>
  );
}
