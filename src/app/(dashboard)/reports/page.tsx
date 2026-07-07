import Link from "next/link";
import { BarChart3, MapPin, Wallet, Layers, Users2, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReportBarList, { type BarItem } from "./report-bar-list";
import InflowTrend, { type InflowPoint } from "./inflow-trend";

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
    .select("id, category, sub_domain, secondary_sub_domains, current_fixed_ctc, current_location, created_at");

  const rows = candidates ?? [];

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("candidate_id, added_by, stage");

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const profileNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    profileNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  // ---- Primary domain (sub_domain) ----
  const bySubDomain: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.sub_domain) return;
    bySubDomain[c.sub_domain] = (bySubDomain[c.sub_domain] ?? 0) + 1;
  });
  const primaryDomainItems: BarItem[] = Object.entries(bySubDomain)
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({
      key: label,
      label,
      count,
      href: `/candidates?sub_domain=${encodeURIComponent(label)}`,
    }));

  // ---- Category / segment ----
  const byCategory: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.category) return;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  });
  const categoryItems: BarItem[] = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({
      key,
      label: CATEGORY_LABELS[key] ?? key,
      count,
      href: `/candidates?category=${encodeURIComponent(key)}`,
    }));

  // ---- Secondary domain (array, non-exclusive tags) ----
  const bySecondary: Record<string, number> = {};
  rows.forEach((c) => {
    (c.secondary_sub_domains ?? []).forEach((tag: string) => {
      bySecondary[tag] = (bySecondary[tag] ?? 0) + 1;
    });
  });
  const secondaryDomainItems: BarItem[] = Object.entries(bySecondary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label, count]) => ({
      key: label,
      label,
      count,
      href: `/candidates?secondary_domain=${encodeURIComponent(label)}`,
    }));

  // ---- CTC band ----
  const ctcItems: BarItem[] = CTC_BANDS.map((band) => {
    const count = rows.filter(
      (c) => c.current_fixed_ctc != null && c.current_fixed_ctc >= band.min && c.current_fixed_ctc < band.max
    ).length;
    return {
      key: band.label,
      label: band.label,
      count,
      href: `/candidates?min_ctc=${band.min}${band.max === Infinity ? "" : `&max_ctc=${band.max}`}`,
    };
  });

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
  const locationItems: BarItem[] = topCities.map(([label, count]) => ({
    key: label,
    label,
    count,
    href: `/candidates?location=${encodeURIComponent(label)}`,
  }));
  if (otherCitiesCount > 0) {
    locationItems.push({ key: "__other", label: "Other cities", count: otherCitiesCount, href: "/candidates" });
  }

  // ---- Inflow trend ----
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let inflowPoints: InflowPoint[] = [];

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
  }

  const inflowTotal = inflowPoints.reduce((sum, p) => sum + p.count, 0);
  const currentRangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Last 30 days";

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
    .map((id) => ({
      id,
      name: profileNames[id] ?? "Unknown recruiter",
      linked: linkedByRecruiter[id]?.size ?? 0,
      placed: placedByRecruiter[id]?.size ?? 0,
    }))
    .sort((a, b) => b.placed - a.placed || b.linked - a.linked);

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

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-900">Primary domain</h2>
          </div>
          <ReportBarList items={primaryDomainItems} colorClass="bg-blue-500/80" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-slate-900">Segment</h2>
          </div>
          <ReportBarList items={categoryItems} colorClass="bg-violet-500/80" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-4 h-4 text-teal-500" />
            <h2 className="text-sm font-semibold text-slate-900">Secondary domain</h2>
            <span className="text-[10.5px] text-slate-400 ml-auto">candidates can have multiple</span>
          </div>
          <ReportBarList items={secondaryDomainItems} colorClass="bg-teal-500/80" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-semibold text-slate-900">Current fixed CTC</h2>
          </div>
          <ReportBarList items={ctcItems} colorClass="bg-emerald-500/80" />
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <MapPin className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-slate-900">Location</h2>
          </div>
          <div className="grid grid-cols-2 gap-x-8">
            <ReportBarList items={locationItems.slice(0, Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" />
            <ReportBarList items={locationItems.slice(Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" />
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-500" />
            <h2 className="text-sm font-semibold text-slate-900">Candidate inflow</h2>
            <span className="text-[11px] text-slate-400">
              {inflowTotal} registered · {currentRangeLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/reports?range=${r.key}`}
                className={`text-[11.5px] font-medium px-2.5 py-1 rounded-full transition-colors ${
                  range === r.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        </div>
        <InflowTrend points={inflowPoints} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Users2 className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-semibold text-slate-900">Recruiter productivity</h2>
        </div>
        {recruiterRows.length === 0 ? (
          <p className="text-[13px] text-slate-400">
            No candidates have been linked to mandates by a recruiter yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recruiterRows.map((r) => (
              <div key={r.id} className="flex items-center justify-between py-2.5">
                <p className="text-[13px] font-medium text-slate-900">{r.name}</p>
                <div className="flex items-center gap-4">
                  <Link
                    href={`/candidates?recruiter=${r.id}`}
                    className="text-[12px] text-slate-600 hover:text-blue-600 flex items-center gap-1"
                  >
                    <span className="font-semibold tabular-nums">{r.linked}</span> linked
                  </Link>
                  <Link
                    href={`/candidates?recruiter=${r.id}&placed_only=1`}
                    className="text-[12px] text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    <span className="font-semibold tabular-nums">{r.placed}</span> placed
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
