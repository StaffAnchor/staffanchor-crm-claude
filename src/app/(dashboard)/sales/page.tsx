import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/ui/stat-tile";
import { Card } from "@/components/ui/card";
import { Users2, Wallet, Trophy, TrendingUp, LineChart } from "lucide-react";
import SalesBoard from "./sales-board";
import SalesBriefingPanel, { type SalesBriefingItem } from "./sales-briefing-panel";
import MarketSignalsPanel, { type MarketSignalRow } from "./market-signals-panel";
import { formatDealValue, SOURCES, SOURCE_LABEL, STAGE_WIN_PROBABILITY, type SalesLeadScoredRow } from "./sales-constants";

export default async function SalesPage() {
  const supabase = await createClient();

  // A Partner only sees leads they brought in themselves -- same scoping
  // rule as Clients. Everyone else (admin/recruiter/freelancer) keeps
  // seeing the full firm-wide pipeline unchanged.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: viewerProfile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).single()
    : { data: null };
  const isPartnerView = viewerProfile?.role === "partner";

  // sales_leads_scored is a live-computed view (same columns as sales_leads
  // plus priority_score/days_in_stage) -- see the
  // sales_ae_assist_briefing_and_scoring migration. Recomputed on every
  // read so the board never shows a stale score.
  let leadsQuery = supabase
    .from("sales_leads_scored")
    .select("*")
    .order("stage_updated_at", { ascending: false });
  if (isPartnerView && user) leadsQuery = leadsQuery.eq("owner_id", user.id);
  const { data: leads } = await leadsQuery;
  const rows = (leads ?? []) as SalesLeadScoredRow[];

  const { data: briefing, error: briefingError } = await supabase.rpc("get_sales_briefing");
  const briefingItems = (briefingError ? [] : briefing ?? []) as SalesBriefingItem[];

  const { data: signals, error: signalsError } = await supabase
    .from("market_signals")
    .select("*")
    .eq("status", "new")
    .order("detected_at", { ascending: false })
    .limit(30);
  const signalItems = (signalsError ? [] : signals ?? []) as MarketSignalRow[];

  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email");
  const ownerNames: Record<string, string> = {};
  (profiles ?? []).forEach((p) => {
    ownerNames[p.id] = p.full_name ?? p.email ?? "Unknown";
  });

  const totalLeads = rows.length;
  const openLeads = rows.filter((r) => r.stage !== "won" && r.stage !== "lost");
  const openPipelineValue = openLeads.reduce((sum, r) => sum + (r.deal_value ?? 0), 0);
  const won = rows.filter((r) => r.stage === "won").length;
  const lost = rows.filter((r) => r.stage === "lost").length;
  const winRate = won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const newThisMonth = rows.filter((r) => new Date(r.created_at) >= monthStart).length;

  // Same auditable stage-weighted-odds approach as fill-probability.ts and
  // the Morning Briefing billing forecast -- sum each open lead's deal
  // value times its stage's historical win probability. Not a prediction
  // of which leads will close, just an expected-value read on the whole
  // open pipeline that moves as leads advance stages.
  const forecastNewClientValue = openLeads.reduce(
    (sum, r) => sum + (r.deal_value ?? 0) * (STAGE_WIN_PROBABILITY[r.stage] ?? 0),
    0
  );

  // Per-source conversion -- lets a recruiter see, e.g., whether the new
  // "Website" channel (converted from Employer Inquiries) actually closes
  // at a different rate than LinkedIn or Referral leads, not just how many
  // leads came from each source. Sources with zero leads are hidden.
  const bySource = SOURCES.map((s) => {
    const sourceLeads = rows.filter((r) => r.source === s.key);
    const sourceWon = sourceLeads.filter((r) => r.stage === "won").length;
    const sourceLost = sourceLeads.filter((r) => r.stage === "lost").length;
    const sourceClosed = sourceWon + sourceLost;
    return {
      key: s.key,
      label: SOURCE_LABEL[s.key] ?? s.key,
      total: sourceLeads.length,
      won: sourceWon,
      winRate: sourceClosed > 0 ? Math.round((sourceWon / sourceClosed) * 100) : null,
      openValue: sourceLeads
        .filter((r) => r.stage !== "won" && r.stage !== "lost")
        .reduce((sum, r) => sum + (r.deal_value ?? 0), 0),
    };
  }).filter((s) => s.total > 0);

  return (
    <div className="max-w-[1500px] mx-auto px-5 py-8">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h1 className="text-ros-display font-semibold tracking-tight text-slate-900 dark:text-slate-100">Sales</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">
            {isPartnerView
              ? "Leads you brought in — target companies to sell recruiting services to."
              : "StaffAnchor’s own client-acquisition pipeline — target companies to sell recruiting services to. Separate from candidates and mandates."}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <StatTile icon={<Users2 className="w-4 h-4" />} label="Total leads" value={totalLeads} />
        <StatTile icon={<Wallet className="w-4 h-4" />} label="Open pipeline value" value={formatDealValue(openPipelineValue, "INR") ?? "—"} accent />
        <StatTile icon={<Trophy className="w-4 h-4" />} label="Win rate (closed leads)" value={winRate !== null ? `${winRate}%` : "—"} />
        <StatTile icon={<TrendingUp className="w-4 h-4" />} label="New this month" value={newThisMonth} />
        <StatTile
          icon={<LineChart className="w-4 h-4" />}
          label="Forecasted new-client value"
          value={formatDealValue(Math.round(forecastNewClientValue), "INR") ?? "—"}
          accent
        />
      </div>

      {bySource.length > 1 && (
        <Card className="mb-4">
          <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-300 mb-2.5">Conversion by source</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {bySource.map((s) => (
              <div key={s.key} className="rounded-ros-md border border-slate-100 dark:border-slate-800 px-3 py-2.5">
                <p className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">{s.label}</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <span className="text-[18px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{s.total}</span>
                  <span className="text-[11px] text-slate-400">lead{s.total === 1 ? "" : "s"}</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {s.winRate !== null ? `${s.winRate}% win rate (${s.won} won)` : "No closed leads yet"}
                </p>
                {s.openValue > 0 && (
                  <p className="text-[11px] text-slate-400 mt-0.5">{formatDealValue(s.openValue, "INR")} open pipeline</p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <MarketSignalsPanel initialItems={signalItems} fetchError={signalsError?.message ?? null} />

      <SalesBriefingPanel initialItems={briefingItems} fetchError={briefingError?.message ?? null} />

      <SalesBoard leads={rows} ownerNames={ownerNames} />
    </div>
  );
}
