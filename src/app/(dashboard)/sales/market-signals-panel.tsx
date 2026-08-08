"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Newspaper, TrendingUp, Users, Briefcase, ExternalLink, Plus, X, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Row shape from market_signals -- a daily news scan (funding raises,
// general hiring, and specifically sales-hiring, India-focused) that gives
// a rep a real, current reason to reach out instead of every lead starting
// from a cold search. Populated by a scheduled scan, not by app code; see
// the migration comment on market_signals for the full picture.
export type CompanyCategory =
  | "b2b_saas"
  | "b2c_d2c"
  | "fintech"
  | "marketplace"
  | "retail_ecommerce"
  | "healthtech"
  | "manufacturing_industrial"
  | "mobility_ev"
  | "logistics_supply_chain"
  | "edtech"
  | "media_entertainment"
  | "other";

export type SalesLeadershipFit = "strong_fit" | "possible_fit" | "unlikely_fit";

export type MarketSignalRow = {
  id: string;
  headline: string;
  summary: string | null;
  company_name: string;
  founder_name: string | null;
  signal_type: "funding" | "hiring" | "sales_hiring";
  source_url: string | null;
  detected_at: string;
  status: "new" | "dismissed" | "added_as_lead";
  added_as_lead_id: string | null;
  company_category: CompanyCategory | null;
  sales_leadership_fit: SalesLeadershipFit | null;
  fit_reason: string | null;
};

const SIGNAL_META: Record<MarketSignalRow["signal_type"], { icon: typeof Newspaper; label: string; tint: string }> = {
  funding: { icon: TrendingUp, label: "Funding raised", tint: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  hiring: { icon: Users, label: "Hiring", tint: "bg-sky-50 text-sky-700 ring-sky-200" },
  sales_hiring: { icon: Briefcase, label: "Hiring sales roles", tint: "bg-blue-50 text-blue-700 ring-blue-200" },
};

const CATEGORY_LABEL: Record<CompanyCategory, string> = {
  b2b_saas: "B2B SaaS",
  b2c_d2c: "B2C / D2C",
  fintech: "Fintech",
  marketplace: "Marketplace",
  retail_ecommerce: "Retail / Ecommerce",
  healthtech: "Healthtech",
  manufacturing_industrial: "Manufacturing / Industrial",
  mobility_ev: "Mobility / EV",
  logistics_supply_chain: "Logistics / Supply Chain",
  edtech: "Edtech",
  media_entertainment: "Media / Entertainment",
  other: "Other",
};

// Whether this company would plausibly need to hire Enterprise/SaaS-style
// sales leadership (VP Sales, Head of Sales, enterprise AEs) -- StaffAnchor's
// actual specialty -- versus retail/consumer sales roles that aren't a fit
// for this firm at all. Set by the daily scan alongside the category, so a
// rep can skim past signals outside the niche instead of reading every
// summary to judge fit themselves.
const FIT_META: Record<SalesLeadershipFit, { label: string; tone: "success" | "warning" | "neutral" }> = {
  strong_fit: { label: "Strong fit", tone: "success" },
  possible_fit: { label: "Possible fit", tone: "warning" },
  unlikely_fit: { label: "Unlikely fit", tone: "neutral" },
};

export default function MarketSignalsPanel({
  initialItems,
  fetchError,
}: {
  initialItems: MarketSignalRow[];
  fetchError: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [items, setItems] = useState(initialItems);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Strong fits float to the top -- that's the whole point of classifying
  // by sales_leadership_fit: a rep should see "needs enterprise sales
  // leadership" prospects before "probably not a fit" ones, not just
  // whatever the scan found most recently.
  const FIT_RANK: Record<string, number> = { strong_fit: 0, possible_fit: 1, unlikely_fit: 2 };
  const open = items
    .filter((i) => i.status === "new")
    .sort((a, b) => {
      const rankDiff = (FIT_RANK[a.sales_leadership_fit ?? ""] ?? 1.5) - (FIT_RANK[b.sales_leadership_fit ?? ""] ?? 1.5);
      if (rankDiff !== 0) return rankDiff;
      return new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
    });

  async function dismiss(id: string) {
    setBusyId(id);
    const { error } = await supabase.from("market_signals").update({ status: "dismissed" }).eq("id", id);
    setBusyId(null);
    if (error) {
      window.alert(`Couldn't dismiss: ${error.message}`);
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function addAsLead(signal: MarketSignalRow) {
    setBusyId(signal.id);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const noteLines = [
      signal.summary,
      signal.company_category ? `Category: ${CATEGORY_LABEL[signal.company_category]}` : null,
      signal.fit_reason ? `Sales leadership fit: ${signal.fit_reason}` : null,
      signal.source_url ? `Source: ${signal.source_url}` : null,
    ].filter(Boolean);
    const { data: lead, error } = await supabase
      .from("sales_leads")
      .insert({
        company_name: signal.company_name,
        contact_name: signal.founder_name,
        contact_title: signal.founder_name ? "Founder" : null,
        source: "market_signal",
        notes: noteLines.join("\n") || null,
        owner_id: user?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !lead) {
      setBusyId(null);
      window.alert(`Couldn't add lead: ${error?.message ?? "Unknown error"}`);
      return;
    }
    const { error: updateError } = await supabase
      .from("market_signals")
      .update({ status: "added_as_lead", added_as_lead_id: lead.id })
      .eq("id", signal.id);
    setBusyId(null);
    if (updateError) {
      window.alert(`Lead was created, but couldn't update the signal: ${updateError.message}`);
    }
    setItems((prev) => prev.filter((i) => i.id !== signal.id));
    router.push(`/sales/${lead.id}`);
  }

  return (
    <Card className="mb-4" padded={false}>
      <button onClick={() => setCollapsed((c) => !c)} className="w-full flex items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-teal-600" />
          <h2 className="text-[13.5px] font-semibold text-slate-900 dark:text-slate-100">Market Signals</h2>
          <span className="text-[11px] text-slate-400 font-normal">India funding &amp; hiring news, scanned daily</span>
          {open.length > 0 && (
            <Badge tone="accent" size="sm">
              {open.length} new
            </Badge>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          {fetchError && <p className="text-[12px] text-rose-500">Couldn&apos;t load signals: {fetchError}</p>}
          {!fetchError && open.length === 0 && (
            <p className="text-[12.5px] text-slate-400">
              No fresh signals right now — a daily scan looks for India companies that just raised funding or are
              hiring (especially sales roles) and drops them here.
            </p>
          )}
          <div className="space-y-2">
            {open.map((signal) => {
              const meta = SIGNAL_META[signal.signal_type];
              const Icon = meta.icon;
              return (
                <div
                  key={signal.id}
                  className="flex items-start gap-3 rounded-ros-md border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2.5"
                >
                  <span className={`w-6 h-6 rounded-ros-full ring-1 flex items-center justify-center shrink-0 ${meta.tint}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-[12.5px] font-semibold text-slate-800 dark:text-slate-200">{signal.company_name}</p>
                      <Badge tone="neutral" size="sm" className="normal-case tracking-normal">
                        {meta.label}
                      </Badge>
                      {signal.company_category && (
                        <Badge tone="accent" size="sm" className="normal-case tracking-normal">
                          {CATEGORY_LABEL[signal.company_category]}
                        </Badge>
                      )}
                      {signal.sales_leadership_fit && (
                        <Badge tone={FIT_META[signal.sales_leadership_fit].tone} size="sm" className="normal-case tracking-normal">
                          {FIT_META[signal.sales_leadership_fit].label}
                        </Badge>
                      )}
                      {signal.founder_name && (
                        <span className="text-[11px] text-slate-400">Founder: {signal.founder_name}</span>
                      )}
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">{signal.headline}</p>
                    {signal.summary && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">{signal.summary}</p>}
                    {signal.fit_reason && (
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 italic">{signal.fit_reason}</p>
                    )}
                    {signal.source_url && (
                      <a
                        href={signal.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 mt-1"
                      >
                        <ExternalLink className="w-3 h-3" /> Source
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="sm" disabled={busyId === signal.id} onClick={() => dismiss(signal.id)} icon={<X className="w-3.5 h-3.5" />}>
                      Dismiss
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busyId === signal.id}
                      onClick={() => addAsLead(signal)}
                      icon={busyId === signal.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    >
                      Add as lead
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
