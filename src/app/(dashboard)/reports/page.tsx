import Link from "next/link";
import {
  BarChart3,
  MapPin,
  Wallet,
  Layers,
  Users2,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Sparkles,
  AlertTriangle,
  UserX,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReportBarList, { type BarItem } from "./report-bar-list";
import InflowTrend, { type InflowPoint } from "./inflow-trend";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";

const CTC_BANDS: { label: string; min: number; max: number }[] = [
  { label: "0–5L", min: 0, max: 5 },
  { label: "5–10L", min: 5, max: 10 },
  { label: "10–15L", min: 10, max: 15 },
  { label: "15–25L", min: 15, max: 25 },
  { label: "25–40L", min: 25, max: 40 },
  { label: "40L+", min: 40, max: Infinity },
];

const CATEGORY_LABELS: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
};

const RANGES = [
  { key: "7", label: "Last 7 days" },
  { key: "15", label: "Last 15 days" },
  { key: "30", label: "Last 30 days" },
  { key: "month", label: "This month" },
  { key: "fy", label: "Current FY" },
];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fyBounds(today: Date) {
  // Indian financial year: Apr 1 – Mar 31
  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return { start: new Date(year, 3, 1), end: new Date(year + 1, 2, 31), label: `FY${year}-${String(year + 1).slice(-2)}` };
}

function pctOf(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function withPct(items: BarItem[], total: number): BarItem[] {
  return items.map((item) => ({ ...item, pct: pctOf(item.count, total) }));
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range = rangeParam ?? "30";
  const supabase = await createClient();

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, category, sub_domain, secondary_sub_domains, current_fixed_ctc, current_location, created_at, status");

  const rows = candidates ?? [];
  const totalCandidates = rows.length;

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "candidate_id, added_by, stage, mandate_id, in_shortlist, shortlisted_at, client_feedback, confirmed_interview_at"
    );

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const profileNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    profileNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  // ---- Cross-pipeline "needs attention" signals -----------------------
  // A capstone intelligence panel that pulls together the same
  // health-signal thresholds already used on Mandates (stale client
  // feedback, aging-with-no-submissions) and Interviews (unscheduled /
  // awaiting outcome), plus incomplete candidate profiles, so a recruiter
  // can see everything that needs a decision from one screen instead of
  // checking four separate pages.
  const { data: allMandatesForAttention } = await supabase.from("mandates").select("id, status, created_at");
  const STALE_DAYS = 4;
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const submittedByMandateAttn = new Set<string>();
  const staleMandateIds = new Set<string>();
  (links ?? []).forEach((l) => {
    if (["submitted", "client_interview", "offer", "placed"].includes(l.stage)) {
      submittedByMandateAttn.add(l.mandate_id);
    }
    if (l.in_shortlist && !l.client_feedback && l.shortlisted_at && new Date(l.shortlisted_at).getTime() < staleCutoff) {
      staleMandateIds.add(l.mandate_id);
    }
  });
  let agingMandatesCount = 0;
  (allMandatesForAttention ?? []).forEach((m) => {
    const daysOpenNum = Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)));
    if (m.status === "open" && daysOpenNum >= 21 && !submittedByMandateAttn.has(m.id)) agingMandatesCount += 1;
  });

  const incompleteProfilesCount = rows.filter((c) => ["awaiting_input", "lead"].includes(c.status ?? "")).length;

  const needsSchedulingCount = (links ?? []).filter((l) => l.stage === "client_interview" && !l.confirmed_interview_at).length;
  const awaitingOutcomeCount = (links ?? []).filter(
    (l) => l.stage === "client_interview" && l.confirmed_interview_at && new Date(l.confirmed_interview_at).getTime() < Date.now()
  ).length;

  const attentionSignals: { label: string; value: number; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: "Mandates, stale client feedback", value: staleMandateIds.size, href: "/mandates", icon: AlertTriangle },
    { label: "Mandates aging, no submissions", value: agingMandatesCount, href: "/mandates", icon: AlertTriangle },
    { label: "Incomplete candidate profiles", value: incompleteProfilesCount, href: "/candidates?incomplete=1", icon: UserX },
    { label: "Interviews needing scheduling", value: needsSchedulingCount, href: "/interviews", icon: CalendarClock },
    { label: "Past interviews awaiting outcome", value: awaitingOutcomeCount, href: "/interviews", icon: CheckCircle2 },
  ];
  const totalAttentionItems = attentionSignals.reduce((sum, s) => sum + s.value, 0);

  // ---- Primary domain (sub_domain) ----
  const bySubDomain: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.sub_domain) return;
    bySubDomain[c.sub_domain] = (bySubDomain[c.sub_domain] ?? 0) + 1;
  });
  const primaryDomainItems: BarItem[] = withPct(
    Object.entries(bySubDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({
        key: label,
        label,
        count,
        href: `/candidates?sub_domain=${encodeURIComponent(label)}`,
      })),
    totalCandidates
  );

  // ---- Category / segment ----
  const byCategory: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.category) return;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  });
  const categoryItems: BarItem[] = withPct(
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        count,
        href: `/candidates?category=${encodeURIComponent(key)}`,
      })),
    totalCandidates
  );

  // ---- Secondary domain (array, non-exclusive tags) ----
  const bySecondary: Record<string, number> = {};
  rows.forEach((c) => {
    (c.secondary_sub_domains ?? []).forEach((tag: string) => {
      bySecondary[tag] = (bySecondary[tag] ?? 0) + 1;
    });
  });
  const secondaryDomainItems: BarItem[] = withPct(
    Object.entries(bySecondary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, count]) => ({
        key: label,
        label,
        count,
        href: `/candidates?secondary_domain=${encodeURIComponent(label)}`,
      })),
    totalCandidates
  );

  // ---- CTC band ----
  const ctcItems: BarItem[] = withPct(
    CTC_BANDS.map((band) => {
      const count = rows.filter(
        (c) => c.current_fixed_ctc != null && c.current_fixed_ctc >= band.min && c.current_fixed_ctc < band.max
      ).length;
      return {
        key: band.label,
        label: band.label,
        count,
        href: `/candidates?min_ctc=${band.min}${band.max === Infinity ? "" : `&max_ctc=${band.max}`}`,
      };
    }),
    totalCandidates
  );

  // ---- Location (top cities) ----
  const byCity: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.current_location) return;
    const city = c.current_location.split(",")[0].trim();
    if (!city) return;
    byCity[city] = (byCity[city] ?? 0) + 1;
  });
  const sortedCities = Object.entries(byCity).sort((a, b) => b[1] - a[1]);
  const topCities = sortedCities.slice(0, 8);
  const otherCitiesCount = sortedCities.slice(8).reduce((sum, [, c]) => sum + c, 0);
  const locationItemsRaw: BarItem[] = topCities.map(([label, count]) => ({
    key: label,
    label,
    count,
    href: `/candidates?location=${encodeURIComponent(label)}`,
  }));
  if (otherCitiesCount > 0) {
    locationItemsRaw.push({ key: "__other", label: "Other cities", count: otherCitiesCount, href: "/candidates" });
  }
  const locationItems = withPct(locationItemsRaw, totalCandidates);

  // ---- Inflow trend (+ prior-period comparison where meaningful) ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let inflowPoints: InflowPoint[] = [];
  let priorPeriodCount: number | null = null;

  if (range === "month" || range === "fy") {
    if (range === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      inflowPoints = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
        const ds = toDateStr(d);
        const count = rows.filter((c) => c.created_at.slice(0, 10) === ds).length;
        return { key: ds, label: String(i + 1), count, href: `/candidates?from=${ds}&to=${ds}` };
      });
      const prevMonthEnd = new Date(monthStart);
      prevMonthEnd.setDate(0);
      const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
      const daysSoFar = Math.min(today.getDate(), daysInMonth);
      const prevFrom = toDateStr(prevMonthStart);
      const prevToDate = new Date(prevMonthStart);
      prevToDate.setDate(Math.min(daysSoFar, prevMonthEnd.getDate()) - 1 + 1);
      const prevTo = toDateStr(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(daysSoFar, prevMonthEnd.getDate())));
      priorPeriodCount = rows.filter((c) => {
        const cd = c.created_at.slice(0, 10);
        return cd >= prevFrom && cd <= prevTo;
      }).length;
    } else {
      const { start } = fyBounds(today);
      inflowPoints = Array.from({ length: 12 }, (_, i) => {
        const monthDate = new Date(start.getFullYear(), start.getMonth() + i, 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
        const from = toDateStr(monthDate);
        const to = toDateStr(monthEnd);
        const count = rows.filter((c) => {
          const cd = c.created_at.slice(0, 10);
          return cd >= from && cd <= to;
        }).length;
        return {
          key: from,
          label: monthDate.toLocaleString("en-IN", { month: "short" }),
          count,
          href: `/candidates?from=${from}&to=${to}`,
        };
      });
      const prevStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
      const prevEnd = new Date(prevStart.getFullYear() + 1, prevStart.getMonth(), 0);
      const prevFrom = toDateStr(prevStart);
      const prevTo = toDateStr(prevEnd);
      priorPeriodCount = rows.filter((c) => {
        const cd = c.created_at.slice(0, 10);
        return cd >= prevFrom && cd <= prevTo;
      }).length;
    }
  } else {
    const days = Number(range) || 30;
    inflowPoints = Array.from({ length: days }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (days - 1 - i));
      const ds = toDateStr(d);
      const count = rows.filter((c) => c.created_at.slice(0, 10) === ds).length;
      return {
        key: ds,
        label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        count,
        href: `/candidates?from=${ds}&to=${ds}`,
      };
    });
    const prevEnd = new Date(today);
    prevEnd.setDate(prevEnd.getDate() - days);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    const prevFrom = toDateStr(prevStart);
    const prevTo = toDateStr(prevEnd);
    priorPeriodCount = rows.filter((c) => {
      const cd = c.created_at.slice(0, 10);
      return cd >= prevFrom && cd <= prevTo;
    }).length;
  }

  const inflowTotal = inflowPoints.reduce((sum, p) => sum + p.count, 0);
  const currentRangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Last 30 days";

  let inflowDeltaPct: number | null = null;
  if (priorPeriodCount !== null) {
    if (priorPeriodCount === 0 && inflowTotal === 0) inflowDeltaPct = 0;
    else if (priorPeriodCount === 0) inflowDeltaPct = 100;
    else inflowDeltaPct = Math.round(((inflowTotal - priorPeriodCount) / priorPeriodCount) * 100);
  }

  // ---- Recruiter productivity ----
  const linkedByRecruiter: Record<string, Set<string>> = {};
  const placedByRecruiter: Record<string, Set<string>> = {};
  (links ?? []).forEach((l) => {
    if (!l.added_by) return;
    (linkedByRecruiter[l.added_by] ??= new Set()).add(l.candidate_id);
    if (l.stage === "placed") (placedByRecruiter[l.added_by] ??= new Set()).add(l.candidate_id);
  });
  const recruiterIds = Array.from(new Set([...Object.keys(linkedByRecruiter), ...Object.keys(placedByRecruiter)]));
  const recruiterRows = recruiterIds
    .map((id) => {
      const linked = linkedByRecruiter[id]?.size ?? 0;
      const placed = placedByRecruiter[id]?.size ?? 0;
      return {
        id,
        name: profileNames[id] ?? "Unknown recruiter",
        linked,
        placed,
        conversion: linked > 0 ? Math.round((placed / linked) * 100) : 0,
      };
    })
    .sort((a, b) => b.placed - a.placed || b.conversion - a.conversion || b.linked - a.linked);

  const totalPlaced = recruiterRows.reduce((sum, r) => sum + r.placed, 0);
  const topRecruiter = recruiterRows[0];
  const topDomain = primaryDomainItems[0];
  const topCategory = categoryItems[0];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 tracking-tight">Reports</h1>
          <p className="text-[12.5px] text-slate-500 mt-0.5">
            Candidate composition, hiring inflow, and recruiter productivity. Click any bar to see the matching
            candidates.
          </p>
        </div>
      </div>

      {/* Headline KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <Card padded={false} className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">Total candidates</p>
          <p className="text-[22px] font-semibold text-slate-900 tabular-nums leading-none">{totalCandidates}</p>
          <p className="text-[11px] text-slate-400 mt-1.5">in the system</p>
        </Card>

        <Card padded={false} className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">
            New · {currentRangeLabel.toLowerCase()}
          </p>
          <p className="text-[22px] font-semibold text-slate-900 tabular-nums leading-none">{inflowTotal}</p>
          {inflowDeltaPct !== null ? (
            <p
              className={`text-[11px] mt-1.5 flex items-center gap-1 font-medium ${
                inflowDeltaPct > 0 ? "text-emerald-600" : inflowDeltaPct < 0 ? "text-rose-500" : "text-slate-400"
              }`}
            >
              {inflowDeltaPct > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : inflowDeltaPct < 0 ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {inflowDeltaPct > 0 ? "+" : ""}
              {inflowDeltaPct}% vs prior period
            </p>
          ) : (
            <p className="text-[11px] text-slate-400 mt-1.5">&nbsp;</p>
          )}
        </Card>

        <Card padded={false} className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">Leading domain</p>
          {topDomain ? (
            <>
              <p className="text-[15px] font-semibold text-slate-900 leading-tight truncate">{topDomain.label}</p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {topDomain.count} candidates · {topDomain.pct}% of total
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-400">No data yet.</p>
          )}
        </Card>

        <Card padded={false} className="p-4">
          <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wide mb-1">Top recruiter</p>
          {topRecruiter && topRecruiter.placed > 0 ? (
            <>
              <p className="text-[15px] font-semibold text-slate-900 leading-tight truncate flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                {topRecruiter.name}
              </p>
              <p className="text-[11px] text-slate-500 mt-1.5">
                {topRecruiter.placed} placed
                {totalPlaced > 0 ? ` · ${pctOf(topRecruiter.placed, totalPlaced)}% of all placements` : ""}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-slate-400">No placements yet.</p>
          )}
        </Card>
      </div>

      {/* Needs attention -- capstone intelligence panel, pulling the same
          health-signal thresholds already surfaced on Mandates and
          Interviews into one cross-pipeline glance. */}
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className={`w-4 h-4 ${totalAttentionItems > 0 ? "text-amber-500" : "text-emerald-500"}`} />
          <h2 className="text-sm font-semibold text-slate-900">Needs attention</h2>
          <span className="text-[10.5px] text-slate-400 ml-auto">across mandates, candidates & interviews</span>
        </div>
        <div className="grid grid-cols-5 gap-2 mt-3">
          {attentionSignals.map((s) => {
            const Icon = s.icon;
            const tone: BadgeTone = s.value === 0 ? "success" : "warning";
            return (
              <Link
                key={s.label}
                href={s.href}
                className="group flex flex-col gap-2 rounded-ros-lg border border-slate-100 bg-slate-50/60 p-3 transition-all duration-200 ease-ros hover:border-slate-200 hover:shadow-ros-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
              >
                <div className="flex items-center justify-between">
                  <Icon className={`w-3.5 h-3.5 ${s.value === 0 ? "text-slate-400" : "text-amber-500"}`} />
                  <Badge tone={tone} size="sm" className="normal-case tracking-normal">
                    {s.value === 0 ? "Clear" : s.value}
                  </Badge>
                </div>
                <p className="text-[11.5px] font-medium text-slate-600 group-hover:text-blue-600 transition-colors duration-200 ease-ros leading-snug">
                  {s.label}
                </p>
              </Link>
            );
          })}
        </div>
      </Card>

      {topCategory && topCategory.count > 0 && (
        <div className="flex items-center gap-2 text-[12.5px] text-slate-600 bg-indigo-50/70 border border-indigo-100 rounded-ros-lg px-3.5 py-2 mb-4">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
          <span>
            <span className="font-semibold text-slate-900">{topCategory.label}</span> makes up{" "}
            <span className="font-semibold text-slate-900">{topCategory.pct}%</span> of the candidate pool
            {topDomain ? (
              <>
                {" "}
                — the largest single domain is <span className="font-semibold text-slate-900">{topDomain.label}</span> at{" "}
                <span className="font-semibold text-slate-900">{topDomain.pct}%</span>
              </>
            ) : null}
            .
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mb-4">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-900">Primary domain</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
          </div>
          <ReportBarList items={primaryDomainItems} colorClass="bg-blue-500/80" highlightTop />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-slate-900">Segment</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
          </div>
          <ReportBarList items={categoryItems} colorClass="bg-violet-500/80" highlightTop />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-teal-500" />
            <h2 className="text-sm font-semibold text-slate-900">Secondary domain</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">candidates can have multiple</span>
          </div>
          <ReportBarList items={secondaryDomainItems} colorClass="bg-teal-500/80" />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-900">Current fixed CTC</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
          </div>
          <ReportBarList items={ctcItems} colorClass="bg-emerald-500/80" highlightTop />
        </Card>

        <Card className="col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">Location</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            <ReportBarList items={locationItems.slice(0, Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" highlightTop />
            <ReportBarList items={locationItems.slice(Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" />
          </div>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900">Candidate inflow</h2>
            <span className="text-[11px] text-slate-400">
              {inflowTotal} registered · {currentRangeLabel}
            </span>
            {inflowDeltaPct !== null && (
              <span
                className={`text-[11px] font-medium flex items-center gap-0.5 ${
                  inflowDeltaPct > 0 ? "text-emerald-600" : inflowDeltaPct < 0 ? "text-rose-500" : "text-slate-400"
                }`}
              >
                {inflowDeltaPct > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : inflowDeltaPct < 0 ? (
                  <TrendingDown className="w-3 h-3" />
                ) : (
                  <Minus className="w-3 h-3" />
                )}
                {inflowDeltaPct > 0 ? "+" : ""}
                {inflowDeltaPct}% vs prior period
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/reports?range=${r.key}`}
                className={`text-[11.5px] font-medium px-2.5 py-1 rounded-ros-full transition-colors duration-200 ease-ros ${
                  range === r.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
        <InflowTrend points={inflowPoints} />
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Users2 className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-slate-900">Recruiter productivity</h2>
          {totalPlaced > 0 && (
            <span className="text-[10.5px] text-slate-400 ml-auto">{totalPlaced} total placements</span>
          )}
        </div>
        {recruiterRows.length === 0 ? (
          <p className="text-[13px] text-slate-400">
            No candidates have been linked to mandates by a recruiter yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recruiterRows.map((r, idx) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <p className="text-[13px] font-medium text-slate-900 flex items-center gap-1.5">
                  {idx === 0 && r.placed > 0 && <Trophy className="w-3.5 h-3.5 text-amber-500" />}
                  {r.name}
                </p>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/candidates?recruiter=${r.id}`}
                    className="text-[12px] text-slate-600 hover:text-blue-600 transition-colors duration-200 ease-ros flex items-center gap-1"
                  >
                    <span className="font-semibold tabular-nums">{r.linked}</span> linked
                  </Link>
                  <Link href={`/candidates?recruiter=${r.id}&placed_only=1`}>
                    <Badge tone="success" size="sm" className="normal-case tracking-normal">
                      {r.placed} placed
                    </Badge>
                  </Link>
                  <span className="text-[12px] text-slate-400 w-[70px] text-right tabular-nums">
                    {r.linked > 0 ? `${r.conversion}% conv.` : "—"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
