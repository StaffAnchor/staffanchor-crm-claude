import Link from "next/link";
import { Briefcase, CheckCircle2, PauseCircle, AlertTriangle, FileEdit } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CreateMandateForm from "./create-mandate-form";
import { type MandateSummary, type HealthSignal } from "./mandates-grid";
import MandatesTable from "./mandates-table";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import MandateRequestLinkPanel from "@/components/mandate-request-link-panel";

// A single filter group in the left sidebar: a field name, plus every
// distinct value seen for it across all mandates (so the list is always
// accurate, never a hardcoded guess), each rendered as a clickable link
// that narrows the table via a query param -- same underlying mechanism
// the status stat-tiles already use, just organized Zoho-style as a
// dedicated "filter by field" rail instead of being folded into the tiles.
type FilterGroup = { key: string; label: string; values: string[] };

function daysOpen(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; city?: string; client?: string }>;
}) {
  const { status, category, city, client } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("mandates")
    .select("id, client_name, role_title, category, sub_domain, city, status, created_at, auto_match_results")
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (city) query = query.eq("city", city);
  if (client) query = query.eq("client_name", client);

  const { data: mandates } = await query;

  const { data: links } = await supabase
    .from("candidate_mandate_links")
    .select("mandate_id, stage, in_shortlist, shortlisted_at, client_feedback");
  const countsByMandate: Record<string, number> = {};
  const submittedByMandate: Record<string, number> = {};
  const staleFeedbackByMandate: Record<string, number> = {};
  // Same 4-day staleness threshold the mandate detail page's client-feedback
  // nudge already uses -- surfaced here too so it's visible without opening
  // every mandate one at a time.
  const STALE_DAYS = 4;
  const staleCutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  (links ?? []).forEach((l) => {
    countsByMandate[l.mandate_id] = (countsByMandate[l.mandate_id] ?? 0) + 1;
    if (["submitted", "client_interview", "offer", "placed"].includes(l.stage)) {
      submittedByMandate[l.mandate_id] = (submittedByMandate[l.mandate_id] ?? 0) + 1;
    }
    if (l.in_shortlist && !l.client_feedback && l.shortlisted_at && new Date(l.shortlisted_at).getTime() < staleCutoff) {
      staleFeedbackByMandate[l.mandate_id] = (staleFeedbackByMandate[l.mandate_id] ?? 0) + 1;
    }
  });

  // Single unfiltered scan of the mandates table covering both the stat
  // tiles (which need every mandate regardless of the status filter
  // currently applied) and the "existing clients" autocomplete list for
  // the New Mandate form -- these used to be two separate full-table
  // round trips even though they're reading the same rows.
  const { data: allMandates } = await supabase
    .from("mandates")
    .select("id, client_name, status, created_at, category, city");
  const existingClients = Array.from(
    new Set((allMandates ?? []).map((r) => r.client_name).filter(Boolean))
  ).sort();
  const statusCounts: Record<string, number> = {};
  let agingCount = 0;
  (allMandates ?? []).forEach((m) => {
    statusCounts[m.status] = (statusCounts[m.status] ?? 0) + 1;
    if (m.status === "open" && daysOpen(m.created_at) >= 21 && !submittedByMandate[m.id]) {
      agingCount += 1;
    }
  });

  const filterGroups: FilterGroup[] = [
    {
      key: "category",
      label: "Function / Domain",
      values: Array.from(new Set((allMandates ?? []).map((m) => m.category).filter(Boolean) as string[])).sort(),
    },
    {
      key: "city",
      label: "City",
      values: Array.from(new Set((allMandates ?? []).map((m) => m.city).filter(Boolean) as string[])).sort(),
    },
    {
      key: "client",
      label: "Client",
      values: existingClients,
    },
  ];

  const mandateSummaries: MandateSummary[] = (mandates ?? []).map((m) => {
    const linked = countsByMandate[m.id] ?? 0;
    const submitted = submittedByMandate[m.id] ?? 0;
    const stale = staleFeedbackByMandate[m.id] ?? 0;
    const daysOpenNum = daysOpen(m.created_at);

    const signals: HealthSignal[] = [];
    if (m.status === "open" && linked === 0 && daysOpenNum >= 3) {
      signals.push({ label: "Needs sourcing", tone: "warning" });
    }
    if (stale > 0) {
      signals.push({ label: `${stale} awaiting client feedback`, tone: "danger" });
    }
    if (m.status === "open" && daysOpenNum >= 21 && submitted === 0) {
      signals.push({ label: "Aging, no submissions", tone: "warning" });
    }

    // Top AI-ranked candidate match, if one has already been computed --
    // either from the auto-run at mandate creation or a manual "Find
    // matches" click on the detail page. Reads the existing cached
    // `auto_match_results` column (matches are already sorted by score
    // descending), so surfacing it in the list costs zero extra AI calls.
    const rawMatches = m.auto_match_results as
      | { candidate_id: string; full_name: string; score: number; reason: string }[]
      | null;
    const topMatch = rawMatches && rawMatches.length > 0 ? rawMatches[0] : null;

    return {
      id: m.id,
      client_name: m.client_name,
      role_title: m.role_title,
      category: m.category,
      sub_domain: m.sub_domain,
      city: m.city,
      status: m.status,
      created_at: m.created_at,
      daysOpen: daysOpenNum,
      linked,
      submitted,
      signals,
      topMatch: topMatch
        ? { candidateId: topMatch.candidate_id, name: topMatch.full_name, score: topMatch.score, reason: topMatch.reason }
        : null,
    };
  });

  const statTiles = [
    { label: "Drafts, needs review", value: statusCounts["draft"] ?? 0, icon: FileEdit, href: "/mandates?status=draft" },
    { label: "Open", value: statusCounts["open"] ?? 0, icon: CheckCircle2, accent: true, href: "/mandates?status=open" },
    { label: "On hold", value: statusCounts["on_hold"] ?? 0, icon: PauseCircle, href: "/mandates?status=on_hold" },
    { label: "Closed", value: statusCounts["closed"] ?? 0, icon: Briefcase, href: "/mandates?status=closed" },
    { label: "Aging, no submissions", value: agingCount, icon: AlertTriangle },
  ];

  const activeFilters: Record<string, string | undefined> = { status, category, city, client };
  // Clicking an already-active value clears that one facet; clicking any
  // other value replaces it -- every other active facet is preserved either
  // way, so filters stack (e.g. category=b2b_sales&city=Mumbai together).
  function filterHref(key: "category" | "city" | "client", value: string) {
    const next = { ...activeFilters, [key]: activeFilters[key] === value ? undefined : value };
    const qs = new URLSearchParams();
    Object.entries(next).forEach(([k, v]) => {
      if (v) qs.set(k, v);
    });
    const s = qs.toString();
    return s ? `/mandates?${s}` : "/mandates";
  }
  const hasAnyFilter = Boolean(status || category || city || client);

  return (
    <div className="flex gap-6">
      {/* Left filter rail -- mirrors Zoho's "FILTER JOB OPENINGS BY" panel:
          every distinct value across all mandates for a handful of core
          fields, click to narrow, click again to clear that one facet. */}
      <aside className="w-[188px] shrink-0 hidden lg:block">
        <div className="sticky top-20 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Filter by</p>
            {hasAnyFilter && (
              <Link href="/mandates" className="text-[11px] text-blue-600 hover:underline">
                Clear all
              </Link>
            )}
          </div>
          {filterGroups.map((group) => (
            <div key={group.key}>
              <p className="text-[11.5px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{group.label}</p>
              {group.values.length === 0 ? (
                <p className="text-[11.5px] text-slate-300">No data yet</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {group.values.map((v) => {
                    const isActive = activeFilters[group.key] === v;
                    return (
                      <Link
                        key={v}
                        href={filterHref(group.key as "category" | "city" | "client", v)}
                        className={`block truncate text-[12px] rounded-md px-2 py-1 transition-colors duration-150 ease-ros ${
                          isActive
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800"
                        }`}
                        title={v}
                      >
                        {group.key === "category" ? v.replace("_", " ") : v}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="flex-1 min-w-0 grid grid-cols-3 gap-6">
        <div className="col-span-2">
          <div className="flex items-baseline justify-between mb-3">
            <div>
              <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Mandates</h1>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                {(mandates ?? []).length} client role{(mandates ?? []).length === 1 ? "" : "s"}
                {hasAnyFilter ? " matching current filters" : ""}
              </p>
            </div>
          </div>

          <div className="bg-slate-50/60 dark:bg-slate-800/50 rounded-ros-lg p-2 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {statTiles.map((t) => {
                const Icon = t.icon;
                const tile = (
                  <StatTile label={t.label} value={t.value} icon={<Icon className="w-4 h-4" strokeWidth={2} />} accent={t.accent} className={t.href ? "cursor-pointer" : undefined} />
                );
                return t.href ? <Link key={t.label} href={t.href}>{tile}</Link> : <div key={t.label}>{tile}</div>;
              })}
            </div>
          </div>

          <MandatesTable mandates={mandateSummaries} totalCount={mandateSummaries.length} />
        </div>
        <div className="space-y-6">
          <MandateRequestLinkPanel />
          <Card className="sticky top-20">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">New mandate</h2>
            <CreateMandateForm existingClients={existingClients} />
          </Card>
        </div>
      </div>
    </div>
  );
}
