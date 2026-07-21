import { createClient } from "@/lib/supabase/server";
import { StatTile } from "@/components/ui/stat-tile";
import { Users2, Wallet, Trophy, TrendingUp } from "lucide-react";
import SalesBoard from "./sales-board";
import { formatDealValue, type SalesLeadRow } from "./sales-constants";

export default async function SalesPage() {
  const supabase = await createClient();

  const { data: leads } = await supabase
    .from("sales_leads")
    .select("*")
    .order("stage_updated_at", { ascending: false });
  const rows = (leads ?? []) as SalesLeadRow[];

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

  return (
    <div>
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-semibold text-slate-900 dark:text-slate-100 tracking-tight">Sales</h1>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mt-0.5">
            StaffAnchor&apos;s own client-acquisition pipeline — target companies to sell recruiting services to.
            Separate from candidates and mandates.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <StatTile icon={<Users2 className="w-4 h-4" />} label="Total leads" value={totalLeads} />
        <StatTile icon={<Wallet className="w-4 h-4" />} label="Open pipeline value" value={formatDealValue(openPipelineValue, "INR") ?? "—"} accent />
        <StatTile icon={<Trophy className="w-4 h-4" />} label="Win rate (closed leads)" value={winRate !== null ? `${winRate}%` : "—"} />
        <StatTile icon={<TrendingUp className="w-4 h-4" />} label="New this month" value={newThisMonth} />
      </div>

      <SalesBoard leads={rows} ownerNames={ownerNames} />
    </div>
  );
}
