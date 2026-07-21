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
  AlertTriangle,
  UserX,
  CalendarClock,
  CheckCircle2,
  ShieldCheck,
  Mail,
  Briefcase,
  Gauge,
  GitBranch,
  Radar,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import ReportBarList, { type BarItem } from "./report-bar-list";
import InflowTrend, { type InflowPoint } from "./inflow-trend";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { Tabs } from "@/components/ui/tabs";
import { STAGE_ORDER, STAGE_LABELS, computeFunnel, pct as pctRate } from "../clients/funnel-utils";
import { computeFillProbability } from "@/lib/fill-probability";

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

// Human labels for candidates.created_by -- the sourcing-channel tag. Kept
// in sync with the same map used on the Candidates page KPI header.
const SOURCE_LABEL: Record<string, string> = {
  quick_apply: "Job Apply",
  self_registration: "Profile Registration",
  candidate_self_signup: "Profile Registration",
  bulk_resume_upload: "Bulk Upload",
  bulk_import: "One-Time Upload (Zoho)",
  recruiter_created: "Recruiter Created",
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

// Single source of truth for "what date window does the selected range
// pill mean" -- used to filter EVERY range-aware widget on this page, not
// just the inflow chart (the single biggest UX bug in the prior version:
// the range selector looked global but only the inflow chart obeyed it).
function rangeBoundsFor(range: string, today: Date): { from: Date; to: Date } {
  if (range === "month") {
    return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: today };
  }
  if (range === "fy") {
    const { start } = fyBounds(today);
    return { from: start, to: today };
  }
  const days = Number(range) || 30;
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));
  return { from, to: today };
}

function pctOf(count: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}

function withPct(items: BarItem[], total: number): BarItem[] {
  return items.map((item) => ({ ...item, pct: pctOf(item.count, total) }));
}

const RANK: Record<string, number> = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]));

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rangeParam } = await searchParams;
  const range = rangeParam ?? "30";
  const supabase = await createClient();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { from: rangeFrom, to: rangeTo } = rangeBoundsFor(range, today);
  const currentRangeLabel = RANGES.find((r) => r.key === range)?.label ?? "Last 30 days";

  const { data: candidates } = await supabase
    .from("candidates")
    .select(
      "id, category, sub_domain, secondary_sub_domains, current_fixed_ctc, current_location, created_at, status, created_by"
    );

  const rows = candidates ?? [];
  const totalCandidates = rows.length;
  // Excludes the one-time Zoho historical migration batch (all 649 rows
  // share the same created_at -- the migration run timestamp, not a real
  // registration date) from every activity/growth metric on this page. The
  // Candidates page KPI header already does this; Reports' inflow chart
  // previously did not, which meant the flagship "hiring inflow" number
  // could silently spike or flatline based on nothing but where the
  // migration timestamp happened to fall relative to the selected range.
  const organicRows = rows.filter((c) => c.created_by !== "bulk_import");

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select(
      "candidate_id, added_by, stage, mandate_id, in_shortlist, shortlisted_at, client_feedback, confirmed_interview_at, stage_updated_at, date_of_joining"
    );
  const allLinks = links ?? [];

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email, role");
  const profileNames: Record<string, string> = {};
  const profileIsVendor: Record<string, boolean> = {};
  (profiles ?? []).forEach((p) => {
    profileNames[p.id] = p.full_name ?? p.email ?? "Unknown";
    profileIsVendor[p.id] = p.role === "freelancer";
  });

  const { data: allMandates } = await supabase
    .from("mandates")
    .select("id, status, created_at, auto_match_results");
  const mandateRows = allMandates ?? [];

  const { data: allAssignments } = await supabase.from("mandate_assignments").select("mandate_id, freelancer_id");
  const staffCountByMandate: Record<string, number> = {};
  (allAssignments ?? []).forEach((a) => {
    staffCountByMandate[a.mandate_id] = (staffCountByMandate[a.mandate_id] ?? 0) + 1;
  });

  const { data: allScreeningRows } = await supabase.from("mandate_screening_answers").select("mandate_id, candidate_id");
  const screenedByMandate: Record<string, Set<string>> = {};
  (allScreeningRows ?? []).forEach((r) => {
    (screenedByMandate[r.mandate_id] ??= new Set()).add(r.candidate_id);
  });

  // ---- Cross-pipeline "needs attention" signals -----------------------
  // A capstone intelligence panel that pulls together the same
  // health-signal thresholds already used on Mandates (stale client
  // feedback, aging-with-no-submissions) and Interviews (unscheduled /
  // awaiting outcome), plus incomplete candidate profiles, so a recruiter
  // can see everything that needs a decision from one screen instead of
  // checking four separate pages.
  const STALE_DAYS = 4;
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const submittedByMandateAttn = new Set<string>();
  const staleMandateIds = new Set<string>();
  const staleFeedbackByMandate: Record<string, number> = {};
  const pipelineCountByMandate: Record<string, number> = {};
  const submittedCountByMandate: Record<string, number> = {};
  allLinks.forEach((l) => {
    pipelineCountByMandate[l.mandate_id] = (pipelineCountByMandate[l.mandate_id] ?? 0) + 1;
    if (["submitted", "client_interview", "client_shortlisted", "offer", "placed"].includes(l.stage)) {
      submittedByMandateAttn.add(l.mandate_id);
      submittedCountByMandate[l.mandate_id] = (submittedCountByMandate[l.mandate_id] ?? 0) + 1;
    }
    if (l.in_shortlist && !l.client_feedback && l.shortlisted_at && new Date(l.shortlisted_at).getTime() < staleCutoff) {
      staleMandateIds.add(l.mandate_id);
      staleFeedbackByMandate[l.mandate_id] = (staleFeedbackByMandate[l.mandate_id] ?? 0) + 1;
    }
  });
  let agingMandatesCount = 0;
  mandateRows.forEach((m) => {
    const daysOpenNum = Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)));
    if (m.status === "open" && daysOpenNum >= 21 && !submittedByMandateAttn.has(m.id)) agingMandatesCount += 1;
  });

  const incompleteProfilesCount = rows.filter((c) => ["awaiting_input", "lead"].includes(c.status ?? "")).length;

  // ---- Portfolio fill-probability rollup -------------------------------
  // The mandate cockpit already computes a deterministic 0-100 fill-risk
  // score per open mandate (lib/fill-probability.ts) -- but that number was
  // trapped on individual mandate pages with no firm-wide view. This is
  // the single most decision-driving number a CEO actually wants from a
  // Reports page: "how many of our open mandates are at risk of missing
  // fill, right now" -- so it's rolled up here across every open mandate,
  // reusing the exact same scoring function rather than inventing a new one.
  const openMandates = mandateRows.filter((m) => m.status === "open");
  let highFillCount = 0;
  let mediumFillCount = 0;
  let lowFillCount = 0;
  openMandates.forEach((m) => {
    const daysOpenNum = Math.max(0, Math.floor((Date.now() - new Date(m.created_at).getTime()) / (1000 * 60 * 60 * 24)));
    const topMatchScore = (m.auto_match_results as { score: number }[] | null)?.[0]?.score ?? null;
    const { bucket } = computeFillProbability({
      daysOpen: daysOpenNum,
      staffCount: staffCountByMandate[m.id] ?? 0,
      pipelineCount: pipelineCountByMandate[m.id] ?? 0,
      submittedCount: submittedCountByMandate[m.id] ?? 0,
      screenedCount: screenedByMandate[m.id]?.size ?? 0,
      staleFeedbackCount: staleFeedbackByMandate[m.id] ?? 0,
      topMatchScore,
    });
    if (bucket === "high") highFillCount += 1;
    else if (bucket === "medium") mediumFillCount += 1;
    else lowFillCount += 1;
  });
  const atRiskMandatesCount = mediumFillCount + lowFillCount;

  // ---- Profile-completion email conversion ----
  // The "Send profile completion emails" bulk action (candidates-table.tsx
  // -> /api/send-invite) never writes anything onto the candidate row --
  // the only record of a send is an audit_log entry with
  // action = 'completion_invite_sent'. We treat "completed" as: invited at
  // least once, and current status has since moved off awaiting_input/lead
  // (i.e. graduated to registered or further along the pipeline).
  const { data: inviteLog } = await supabase
    .from("audit_log")
    .select("entity_id, at")
    .eq("entity", "candidate")
    .eq("action", "completion_invite_sent");
  const invitedIds = new Set((inviteLog ?? []).map((r) => r.entity_id));
  const totalInvitesSent = (inviteLog ?? []).length;
  const totalCandidatesInvited = invitedIds.size;
  const invitedCandidates = rows.filter((c) => invitedIds.has(c.id));
  const invitedCompletedIds = invitedCandidates
    .filter((c) => !["awaiting_input", "lead"].includes(c.status ?? ""))
    .map((c) => c.id);
  const invitedStillIncompleteIds = invitedCandidates
    .filter((c) => ["awaiting_input", "lead"].includes(c.status ?? ""))
    .map((c) => c.id);
  const invitedCompletedCount = invitedCompletedIds.length;
  const invitedStillIncompleteCount = invitedStillIncompleteIds.length;
  const inviteConversionPct = pctOf(invitedCompletedCount, totalCandidatesInvited);
  const inviteConversionItems: BarItem[] = withPct(
    [
      {
        key: "completed",
        label: "Completed profile",
        count: invitedCompletedCount,
        href: invitedCompletedCount > 0 ? `/candidates?ids=${invitedCompletedIds.join(",")}` : "/candidates",
      },
      {
        key: "still_incomplete",
        label: "Still incomplete",
        count: invitedStillIncompleteCount,
        href: invitedStillIncompleteCount > 0 ? `/candidates?ids=${invitedStillIncompleteIds.join(",")}` : "/candidates",
      },
    ],
    totalCandidatesInvited
  );

  const needsSchedulingCount = allLinks.filter((l) => l.stage === "client_interview" && !l.confirmed_interview_at).length;
  const awaitingOutcomeCount = allLinks.filter(
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

  // ---- Candidate pool composition (all-time, incl. historical import) --
  // These are workforce-planning charts ("what capacity do we have by
  // domain"), not activity metrics -- deliberately NOT range-filtered or
  // bulk_import-excluded, but now clearly labeled as such so nobody reads
  // them as "current sourcing mix" by mistake.
  const bySubDomain: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.sub_domain) return;
    bySubDomain[c.sub_domain] = (bySubDomain[c.sub_domain] ?? 0) + 1;
  });
  const primaryDomainItems: BarItem[] = withPct(
    Object.entries(bySubDomain)
      .sort((a, b) => b[1] - a[1])
      .map(([label, count]) => ({ key: label, label, count, href: `/candidates?sub_domain=${encodeURIComponent(label)}` })),
    totalCandidates
  );

  const byCategory: Record<string, number> = {};
  rows.forEach((c) => {
    if (!c.category) return;
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
  });
  const categoryItems: BarItem[] = withPct(
    Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({ key, label: CATEGORY_LABELS[key] ?? key, count, href: `/candidates?category=${encodeURIComponent(key)}` })),
    totalCandidates
  );

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
      .map(([label, count]) => ({ key: label, label, count, href: `/candidates?secondary_domain=${encodeURIComponent(label)}` })),
    totalCandidates
  );

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
  if (otherCitiesCount > 0) locationItemsRaw.push({ key: "__other", label: "Other cities", count: otherCitiesCount, href: "/candidates" });
  const locationItems = withPct(locationItemsRaw, totalCandidates);

  // ---- Source channel breakdown (all-time) -----------------------------
  // created_by is already a rich, populated tag (quick_apply /
  // self_registration / recruiter_created / bulk_resume_upload /
  // bulk_import) that no prior report ever surfaced as its own chart.
  const bySource: Record<string, number> = {};
  rows.forEach((c) => {
    const key = c.created_by ?? "unknown";
    bySource[key] = (bySource[key] ?? 0) + 1;
  });
  const sourceItems: BarItem[] = withPct(
    Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: SOURCE_LABEL[key] ?? key,
        count,
        href: key === "unknown" ? "/candidates" : `/candidates?created_by=${encodeURIComponent(key)}`,
      })),
    totalCandidates
  );

  // ---- Candidate inflow trend (organic only) + prior-period comparison --
  let inflowPoints: InflowPoint[] = [];
  let priorPeriodCount: number | null = null;

  if (range === "month" || range === "fy") {
    if (range === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      inflowPoints = Array.from({ length: daysInMonth }, (_, i) => {
        const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
        const ds = toDateStr(d);
        const count = organicRows.filter((c) => c.created_at.slice(0, 10) === ds).length;
        return { key: ds, label: String(i + 1), count, href: `/candidates?from=${ds}&to=${ds}` };
      });
      const prevMonthEnd = new Date(monthStart);
      prevMonthEnd.setDate(0);
      const prevMonthStart = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), 1);
      const daysSoFar = Math.min(today.getDate(), daysInMonth);
      const prevFrom = toDateStr(prevMonthStart);
      const prevTo = toDateStr(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(daysSoFar, prevMonthEnd.getDate())));
      priorPeriodCount = organicRows.filter((c) => {
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
        const count = organicRows.filter((c) => {
          const cd = c.created_at.slice(0, 10);
          return cd >= from && cd <= to;
        }).length;
        return { key: from, label: monthDate.toLocaleString("en-IN", { month: "short" }), count, href: `/candidates?from=${from}&to=${to}` };
      });
      const prevStart = new Date(start.getFullYear() - 1, start.getMonth(), 1);
      const prevEnd = new Date(prevStart.getFullYear() + 1, prevStart.getMonth(), 0);
      const prevFrom = toDateStr(prevStart);
      const prevTo = toDateStr(prevEnd);
      priorPeriodCount = organicRows.filter((c) => {
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
      const count = organicRows.filter((c) => c.created_at.slice(0, 10) === ds).length;
      return { key: ds, label: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count, href: `/candidates?from=${ds}&to=${ds}` };
    });
    const prevEnd = new Date(today);
    prevEnd.setDate(prevEnd.getDate() - days);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - (days - 1));
    const prevFrom = toDateStr(prevStart);
    const prevTo = toDateStr(prevEnd);
    priorPeriodCount = organicRows.filter((c) => {
      const cd = c.created_at.slice(0, 10);
      return cd >= prevFrom && cd <= prevTo;
    }).length;
  }

  const inflowTotal = inflowPoints.reduce((sum, p) => sum + p.count, 0);

  let inflowDeltaPct: number | null = null;
  if (priorPeriodCount !== null) {
    if (priorPeriodCount === 0 && inflowTotal === 0) inflowDeltaPct = 0;
    else if (priorPeriodCount === 0) inflowDeltaPct = 100;
    else inflowDeltaPct = Math.round(((inflowTotal - priorPeriodCount) / priorPeriodCount) * 100);
  }

  // ---- Firm-wide pipeline funnel (all-time snapshot) -------------------
  // Reuses the exact same ordinal-stage math already built and proven for
  // the per-client funnel (Clients module), just rolled up firm-wide
  // instead of scoped to one client -- rather than reinventing pipeline
  // math a second time. Fixes the client_shortlisted undercount bug found
  // in that shared lib (see funnel-utils.ts) as part of this pass.
  const firmFunnel = computeFunnel(allLinks.map((l) => l.stage));

  // ---- Stage movement in range ------------------------------------------
  // The funnel above is a point-in-time snapshot of the whole portfolio
  // (mirrors how the Clients module already reports it) -- this is the
  // complementary "what actually moved during the selected window" view,
  // driven by stage_updated_at, so the global range selector has real
  // teeth beyond just the inflow chart.
  const movementCounts: Record<string, number> = {};
  let movementTotal = 0;
  allLinks.forEach((l) => {
    if (!l.stage_updated_at) return;
    const d = new Date(l.stage_updated_at);
    if (d < rangeFrom || d > new Date(rangeTo.getTime() + 24 * 60 * 60 * 1000 - 1)) return;
    movementCounts[l.stage] = (movementCounts[l.stage] ?? 0) + 1;
    movementTotal += 1;
  });
  const movementItems: BarItem[] = withPct(
    [...STAGE_ORDER, "rejected"].map((s) => ({
      key: s,
      label: s === "rejected" ? "Rejected" : STAGE_LABELS[s as (typeof STAGE_ORDER)[number]],
      count: movementCounts[s] ?? 0,
      href: "/mandates",
    })),
    movementTotal
  );

  // ---- Placements in range (organic signal of revenue-generating events)
  const placementsInRange = allLinks.filter((l) => {
    if (l.stage !== "placed" || !l.date_of_joining) return false;
    const d = new Date(l.date_of_joining);
    return d >= rangeFrom && d <= new Date(rangeTo.getTime() + 24 * 60 * 60 * 1000 - 1);
  }).length;

  // ---- Recruiter productivity: full funnel per recruiter, not just
  // linked -> placed. "Linked" only measures who sourced/attached a
  // candidate to a mandate; without the interim stages a recruiter who
  // links volume but never converts looked identical to an efficient
  // closer except in one ratio column. This mirrors the per-client funnel
  // approach, just keyed by added_by instead of client_id.
  const byRecruiter: Record<string, { linked: Set<string>; submitted: Set<string>; interview: Set<string>; offer: Set<string>; placed: Set<string> }> = {};
  allLinks.forEach((l) => {
    if (!l.added_by) return;
    const bucket = (byRecruiter[l.added_by] ??= {
      linked: new Set(),
      submitted: new Set(),
      interview: new Set(),
      offer: new Set(),
      placed: new Set(),
    });
    bucket.linked.add(l.candidate_id);
    const rank = RANK[l.stage];
    if (rank === undefined) return;
    if (rank >= RANK.submitted) bucket.submitted.add(l.candidate_id);
    if (rank >= RANK.client_interview) bucket.interview.add(l.candidate_id);
    if (rank >= RANK.offer) bucket.offer.add(l.candidate_id);
    if (rank >= RANK.placed) bucket.placed.add(l.candidate_id);
  });
  const recruiterRows = Object.entries(byRecruiter)
    .map(([id, b]) => ({
      id,
      name: profileNames[id] ?? "Unknown",
      isVendor: profileIsVendor[id] ?? false,
      linked: b.linked.size,
      submitted: b.submitted.size,
      interview: b.interview.size,
      offer: b.offer.size,
      placed: b.placed.size,
      conversion: b.linked.size > 0 ? Math.round((b.placed.size / b.linked.size) * 100) : 0,
    }))
    .sort((a, b) => b.placed - a.placed || b.conversion - a.conversion || b.linked - a.linked);

  const totalPlaced = recruiterRows.reduce((sum, r) => sum + r.placed, 0);
  const topRecruiter = recruiterRows[0];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Reports</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            Portfolio risk, pipeline conversion, and recruiter productivity — the numbers that change a decision, not
            just describe the database. Click any bar or tile to see the matching records.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/reports?range=${r.key}`}
              className={`text-[11.5px] font-medium px-2.5 py-1 rounded-ros-full transition-colors duration-200 ease-ros ${
                range === r.key ? "bg-slate-900 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Headline KPI strip -- every tile here is NEW information, not a
          restatement of a chart below (the prior version showed "leading
          domain" and "top recruiter" as a KPI tile, a callout banner, AND
          fed into an AI paragraph -- the same two facts, three times). */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        <StatTile icon={<Users2 className="w-4 h-4" />} label="Total candidates in system" value={totalCandidates} />
        <StatTile
          icon={inflowDeltaPct !== null && inflowDeltaPct >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          label={`New · ${currentRangeLabel.toLowerCase()} (organic)`}
          value={inflowTotal}
          accent
        />
        <StatTile icon={<Briefcase className="w-4 h-4" />} label="Open mandates" value={openMandates.length} />
        <StatTile
          icon={<Gauge className="w-4 h-4" />}
          label="Mandates at fill risk"
          value={atRiskMandatesCount}
          className={atRiskMandatesCount > 0 ? "border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20" : undefined}
        />
        <StatTile icon={<Trophy className="w-4 h-4" />} label={`Placements · ${currentRangeLabel.toLowerCase()}`} value={placementsInRange} />
      </div>

      <Tabs
        defaultKey="overview"
        items={[
          {
            key: "overview",
            label: "Overview",
            icon: <Radar className="w-3.5 h-3.5" />,
            content: (
              <>
                {/* Needs attention -- capstone intelligence panel, pulling the
                    same health-signal thresholds already surfaced on Mandates
                    and Interviews into one cross-pipeline glance. */}
                <Card className="mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck className={`w-4 h-4 ${totalAttentionItems > 0 ? "text-amber-500" : "text-emerald-500"}`} />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Needs attention</h2>
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
                          className="group flex flex-col gap-2 rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50 p-3 transition-all duration-200 ease-ros hover:border-slate-200 hover:shadow-ros-sm hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
                        >
                          <div className="flex items-center justify-between">
                            <Icon className={`w-3.5 h-3.5 ${s.value === 0 ? "text-slate-400" : "text-amber-500"}`} />
                            <Badge tone={tone} size="sm" className="normal-case tracking-normal">
                              {s.value === 0 ? "Clear" : s.value}
                            </Badge>
                          </div>
                          <p className="text-[11.5px] font-medium text-slate-600 dark:text-slate-400 group-hover:text-blue-600 transition-colors duration-200 ease-ros leading-snug">
                            {s.label}
                          </p>
                        </Link>
                      );
                    })}
                  </div>
                </Card>

                {/* Portfolio fill-risk breakdown -- the mandate cockpit's
                    per-mandate fill-probability score, rolled up firm-wide.
                    This is the one number a CEO should look at before asking
                    "are we going to hit our numbers this month." */}
                <Card className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Gauge className="w-4 h-4 text-amber-500" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Fill-risk across open mandates</h2>
                    <span className="text-[10.5px] text-slate-400 ml-auto">
                      {openMandates.length} open mandate{openMandates.length === 1 ? "" : "s"} scored
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <Link
                      href="/mandates"
                      className="rounded-ros-lg border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 p-3 hover:shadow-ros-sm transition-all duration-200 ease-ros"
                    >
                      <p className="text-[22px] font-semibold text-emerald-700 dark:text-emerald-300 tabular-nums leading-none">{highFillCount}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">High probability of filling</p>
                    </Link>
                    <Link
                      href="/mandates"
                      className="rounded-ros-lg border border-amber-100 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 p-3 hover:shadow-ros-sm transition-all duration-200 ease-ros"
                    >
                      <p className="text-[22px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums leading-none">{mediumFillCount}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Medium — needs a push</p>
                    </Link>
                    <Link
                      href="/mandates"
                      className="rounded-ros-lg border border-rose-100 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20 p-3 hover:shadow-ros-sm transition-all duration-200 ease-ros"
                    >
                      <p className="text-[22px] font-semibold text-rose-700 dark:text-rose-300 tabular-nums leading-none">{lowFillCount}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">Low — likely to miss without action</p>
                    </Link>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Candidate inflow</h2>
                      <span className="text-[11px] text-slate-400">
                        {inflowTotal} registered (organic) · {currentRangeLabel}
                      </span>
                      {inflowDeltaPct !== null && (
                        <span
                          className={`text-[11px] font-medium flex items-center gap-0.5 ${
                            inflowDeltaPct > 0 ? "text-emerald-600" : inflowDeltaPct < 0 ? "text-rose-500" : "text-slate-400"
                          }`}
                        >
                          {inflowDeltaPct > 0 ? <TrendingUp className="w-3 h-3" /> : inflowDeltaPct < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                          {inflowDeltaPct > 0 ? "+" : ""}
                          {inflowDeltaPct}% vs prior period
                        </span>
                      )}
                    </div>
                  </div>
                  <InflowTrend points={inflowPoints} />
                </Card>
              </>
            ),
          },
          {
            key: "pipeline",
            label: "Pipeline & Conversion",
            icon: <GitBranch className="w-3.5 h-3.5" />,
            content: (
              <>
                <Card className="mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <GitBranch className="w-4 h-4 text-blue-500" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Firm-wide pipeline funnel</h2>
                    <span className="text-[10.5px] text-slate-400 ml-auto">
                      all-time snapshot · {firmFunnel.total} candidate-mandate links · same math as the per-client funnel
                    </span>
                  </div>
                  <div className="space-y-2 mb-4">
                    {STAGE_ORDER.map((s) => {
                      const count = firmFunnel.byStage[s] ?? 0;
                      const max = Math.max(1, ...STAGE_ORDER.map((k) => firmFunnel.byStage[k] ?? 0));
                      const widthPct = count > 0 ? Math.max((count / max) * 100, 4) : 0;
                      return (
                        <div key={s} className="flex items-center gap-2.5">
                          <span className="w-[112px] shrink-0 text-[11.5px] text-slate-600 dark:text-slate-400">{STAGE_LABELS[s]}</span>
                          <div className="flex-1 h-2 rounded-ros-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-ros-full bg-blue-500/80" style={{ width: `${widthPct}%` }} />
                          </div>
                          <span className="w-[40px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-slate-700 dark:text-slate-300">{count}</span>
                        </div>
                      );
                    })}
                    {firmFunnel.rejected > 0 && (
                      <div className="flex items-center gap-2.5">
                        <span className="w-[112px] shrink-0 text-[11.5px] text-rose-500">Rejected</span>
                        <div className="flex-1 h-2 rounded-ros-full bg-rose-50 dark:bg-rose-950/30 overflow-hidden">
                          <div
                            className="h-full rounded-ros-full bg-rose-400/80"
                            style={{ width: `${Math.max((firmFunnel.rejected / Math.max(1, firmFunnel.total)) * 100, 4)}%` }}
                          />
                        </div>
                        <span className="w-[40px] shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-rose-600">{firmFunnel.rejected}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{pctRate(firmFunnel.subToInterviewRate)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Submitted → Interview</p>
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{pctRate(firmFunnel.interviewToOfferRate)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Interview → Offer</p>
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{pctRate(firmFunnel.offerToPlacedRate)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Offer → Joined</p>
                    </div>
                    <div>
                      <p className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none">{pctRate(firmFunnel.subToPlacedRate)}</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">Submitted → Placed</p>
                    </div>
                  </div>
                </Card>

                <Card className="mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <TrendingUp className="w-4 h-4 text-teal-500" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Stage movement</h2>
                    <span className="text-[10.5px] text-slate-400 ml-auto">
                      candidates that moved stage during {currentRangeLabel.toLowerCase()} · velocity, not a snapshot
                    </span>
                  </div>
                  <ReportBarList items={movementItems} colorClass="bg-teal-500/80" emptyLabel="No stage changes recorded in this window." />
                </Card>

                <Card className="flex items-start gap-2.5 bg-slate-50/60 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800">
                  <Wallet className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">No revenue/commercial report exists yet</span> — there is
                    no fee, commission, or placement-value field anywhere on <code className="text-[11px]">mandates</code> or{" "}
                    <code className="text-[11px]">clients</code> today, so revenue-per-placement, pipeline value, or margin cannot be reported
                    without a schema change. Recommend adding a <code className="text-[11px]">placement_fee</code> /{" "}
                    <code className="text-[11px]">fee_percentage</code> field at mandate creation to unlock this — flagging explicitly rather
                    than omitting it silently.
                  </p>
                </Card>
              </>
            ),
          },
          {
            key: "recruiters",
            label: "Recruiter Performance",
            icon: <Users2 className="w-3.5 h-3.5" />,
            content: (
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Users2 className="w-4 h-4 text-rose-500" />
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Recruiter &amp; vendor productivity</h2>
                  <span className="text-[10.5px] text-slate-400 ml-auto">
                    all-time · full funnel per person, not just linked → placed · {totalPlaced} total placements
                  </span>
                </div>
                {recruiterRows.length === 0 ? (
                  <p className="text-[13px] text-slate-400">No candidates have been linked to mandates yet.</p>
                ) : (
                  <div>
                    <div className="grid grid-cols-[1fr_60px_70px_70px_60px_60px_70px] gap-2 px-1 pb-2 text-[10.5px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 dark:border-slate-800">
                      <span>Recruiter</span>
                      <span className="text-right">Linked</span>
                      <span className="text-right">Submitted+</span>
                      <span className="text-right">Interview+</span>
                      <span className="text-right">Offer+</span>
                      <span className="text-right">Placed</span>
                      <span className="text-right">Conv.</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {recruiterRows.map((r, idx) => (
                        <div key={r.id} className="grid grid-cols-[1fr_60px_70px_70px_60px_60px_70px] gap-2 items-center py-2.5 px-1">
                          <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
                            {idx === 0 && r.placed > 0 && <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                            <span className="truncate">{r.name}</span>
                            {r.isVendor && <span className="text-[9.5px] uppercase text-slate-400 shrink-0">vendor</span>}
                          </p>
                          <Link href={`/candidates?recruiter=${r.id}`} className="text-[12px] text-right tabular-nums text-slate-600 dark:text-slate-400 hover:text-blue-600 transition-colors duration-200 ease-ros">
                            {r.linked}
                          </Link>
                          <span className="text-[12px] text-right tabular-nums text-slate-600 dark:text-slate-400">{r.submitted}</span>
                          <span className="text-[12px] text-right tabular-nums text-slate-600 dark:text-slate-400">{r.interview}</span>
                          <span className="text-[12px] text-right tabular-nums text-slate-600 dark:text-slate-400">{r.offer}</span>
                          <Link href={`/candidates?recruiter=${r.id}&placed_only=1`} className="text-right">
                            <Badge tone="success" size="sm" className="normal-case tracking-normal">
                              {r.placed}
                            </Badge>
                          </Link>
                          <span className="text-[12px] text-right tabular-nums text-slate-400">{r.linked > 0 ? `${r.conversion}%` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            ),
          },
          {
            key: "pool",
            label: "Candidate Pool",
            icon: <Layers className="w-3.5 h-3.5" />,
            content: (
              <>
                <p className="text-[11.5px] text-slate-400 mb-3">
                  Total talent-pool composition, all-time — includes the historical Zoho import batch, so this reflects the whole database, not
                  current sourcing mix (see Overview / Pipeline tabs for that).
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="w-4 h-4 text-blue-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Primary domain</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
                    </div>
                    <ReportBarList items={primaryDomainItems} colorClass="bg-blue-500/80" highlightTop />
                  </Card>

                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-4 h-4 text-violet-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Segment</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
                    </div>
                    <ReportBarList items={categoryItems} colorClass="bg-violet-500/80" highlightTop />
                  </Card>

                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Layers className="w-4 h-4 text-teal-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Secondary domain</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">candidates can have multiple</span>
                    </div>
                    <ReportBarList items={secondaryDomainItems} colorClass="bg-teal-500/80" />
                  </Card>

                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Wallet className="w-4 h-4 text-emerald-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Current fixed CTC</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
                    </div>
                    <ReportBarList items={ctcItems} colorClass="bg-emerald-500/80" highlightTop />
                  </Card>

                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <Radar className="w-4 h-4 text-indigo-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Source channel</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">how candidates entered the system</span>
                    </div>
                    <ReportBarList items={sourceItems} colorClass="bg-indigo-500/80" highlightTop />
                  </Card>

                  <Card>
                    <div className="flex items-center gap-2 mb-4">
                      <MapPin className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Location</h2>
                      <span className="text-[10.5px] text-slate-400 ml-auto">% of total candidates</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6">
                      <ReportBarList items={locationItems.slice(0, Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" highlightTop />
                      <ReportBarList items={locationItems.slice(Math.ceil(locationItems.length / 2))} colorClass="bg-amber-500/80" />
                    </div>
                  </Card>
                </div>

                <Card>
                  <div className="flex items-center gap-2 mb-1">
                    <Mail className="w-4 h-4 text-blue-500" />
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile-completion email conversion</h2>
                    <span className="text-[10.5px] text-slate-400 ml-auto">
                      {totalInvitesSent} email{totalInvitesSent === 1 ? "" : "s"} sent · {totalCandidatesInvited} candidate
                      {totalCandidatesInvited === 1 ? "" : "s"} invited
                    </span>
                  </div>
                  {totalCandidatesInvited === 0 ? (
                    <p className="text-[13px] text-slate-400 mt-2">No profile-completion emails sent yet.</p>
                  ) : (
                    <>
                      <p className="text-[22px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums leading-none mt-2 mb-3">
                        {inviteConversionPct}%
                        <span className="text-[12px] font-normal text-slate-400 ml-2">conversion rate</span>
                      </p>
                      <ReportBarList items={inviteConversionItems} colorClass="bg-blue-500/80" />
                    </>
                  )}
                </Card>
              </>
            ),
          },
        ]}
      />
    </div>
  );
}
