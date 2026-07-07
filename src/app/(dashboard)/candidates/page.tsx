import Link from "next/link";
import {
  Users,
  Sparkles,
  Eye,
  Star,
  Send,
  Trophy,
  SlidersHorizontal,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesTable from "./candidates-table";

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
      "id, full_name, email, phone, current_location, current_employer, current_job_title, category, sub_domain, total_experience_years, current_fixed_ctc, notice_period, status, recruiter_assessment, segment_data, created_at"
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
  if (params.notice_period) query = query.eq("notice_period", params.notice_period);
  if (params.recommendation) {
    query = query.eq("recruiter_assessment->>overall_recommendation", params.recommendation);
  }

  const { data: candidates, error } = await query;

  const { data: subDomainRows } = await supabase
    .from("candidates")
    .select("sub_domain")
    .not("sub_domain", "is", null);
  const subDomains = Array.from(new Set((subDomainRows ?? []).map((r) => r.sub_domain).filter(Boolean))).sort();

  const { data: allRows } = await supabase.from("candidates").select("status, created_at");
  const statusCounts: Record<string, number> = {};
  let newToday = 0;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  (allRows ?? []).forEach((r) => {
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    if (new Date(r.created_at) >= startOfToday) newToday += 1;
  });
  const totalCount = (allRows ?? []).length;

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
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">Candidates</h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
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

      <div className="grid grid-cols-6 gap-3 mb-5">
        {kpis.map((k) => {
          const Icon = k.icon;
          const content = (
            <div
              className={`bg-white border-l-[3px] ${k.accent} border-y border-r border-slate-200 rounded-lg p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150`}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-4 h-4 ${k.iconColor}`} strokeWidth={2} />
              </div>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">{k.value}</p>
              <p className="text-[12px] text-slate-500 mt-0.5">{k.label}</p>
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

      <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5 shadow-sm">
        <p className="text-[12px] font-medium text-slate-500 uppercase tracking-wide mb-3">
          Hiring pipeline
        </p>
        <div className="flex items-stretch gap-1.5">
          {FUNNEL_STAGES.map((stage, i) => {
            const count = funnelCounts[stage.key] ?? 0;
            const heightPct = Math.max(18, (count / funnelMax) * 100);
            return (
              <Link
                key={stage.key}
                href={
                  stage.key === "lead_registered"
                    ? "/candidates"
                    : `/candidates?status=${stage.key === "offer_placed" ? "offer" : stage.key}`
                }
                className="group flex-1 flex flex-col items-center"
                title={`${count} candidate${count === 1 ? "" : "s"} · ${stage.label}`}
              >
                <div className="w-full h-16 flex items-end mb-2">
                  <div
                    className={`w-full rounded-md ${stage.color} opacity-80 group-hover:opacity-100 transition-all duration-200 group-hover:-translate-y-0.5`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-900 tabular-nums">{count}</p>
                <p className="text-[11px] text-slate-500 text-center">{stage.label}</p>
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

      <form className="bg-white border border-slate-200 rounded-xl p-4 mb-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <input
            name="q"
            defaultValue={params.q}
            placeholder="Search candidates by name, email, employer..."
            className="flex-1 min-w-[220px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
          />
          {params.category && <input type="hidden" name="category" value={params.category} />}
          {params.status && <input type="hidden" name="status" value={params.status} />}
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
          {params.status && (
            <Link
              href={qs({ status: undefined })}
              className="text-[12px] font-medium px-3 py-1 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-200"
            >
              Status: {STATUS_LABEL[params.status] ?? params.status} ✕
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Notice period</label>
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

      <CandidatesTable candidates={(candidates ?? []) as never} />
    </div>
  );
}
