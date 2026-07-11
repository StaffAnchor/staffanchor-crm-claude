import Link from "next/link";
import { Trophy, AlertTriangle } from "lucide-react";
import { pct, type FunnelStats } from "./funnel-utils";
import { Card } from "@/components/ui/card";

export type ClientLeaderRow = {
  id: string;
  name: string;
  stats: FunnelStats;
};

export default function ClientLeaderboard({ rows }: { rows: ClientLeaderRow[] }) {
  // Only rank clients that actually have submissions — otherwise the ratio is meaningless noise.
  const ranked = rows
    .filter((r) => r.stats.submittedPlus > 0)
    .sort((a, b) => {
      const rateA = a.stats.subToInterviewRate ?? -1;
      const rateB = b.stats.subToInterviewRate ?? -1;
      if (rateB !== rateA) return rateB - rateA;
      return (b.stats.subToPlacedRate ?? -1) - (a.stats.subToPlacedRate ?? -1);
    });

  const withoutData = rows.length - ranked.length;

  if (ranked.length === 0) {
    return (
      <Card className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Client performance</h2>
        </div>
        <p className="text-[13px] text-slate-400">
          No candidates have been submitted to any client yet. Once recruiters start moving candidates
          through the pipeline, submission → interview → placement conversion rates will show up here.
        </p>
      </Card>
    );
  }

  const top = ranked.slice(0, 3);
  const bottom = ranked.length > 4 ? ranked.slice(-2).reverse() : [];

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-slate-900">Client performance</h2>
        </div>
        <span className="text-[11px] text-slate-400">
          Ranked by submitted → interview conversion · {ranked.length} client{ranked.length === 1 ? "" : "s"} with data
          {withoutData > 0 ? `, ${withoutData} awaiting first submission` : ""}
        </span>
      </div>

      <div className={`grid gap-4 ${bottom.length ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600 mb-2">
            Best converting
          </p>
          <div className="space-y-2">
            {top.map((r, i) => (
              <LeaderRow key={r.id} rank={i + 1} row={r} positive />
            ))}
          </div>
        </div>

        {bottom.length > 0 && (
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-rose-500 mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> Needs attention
            </p>
            <div className="space-y-2">
              {bottom.map((r) => (
                <LeaderRow key={r.id} row={r} positive={false} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function LeaderRow({ row, rank, positive }: { row: ClientLeaderRow; rank?: number; positive: boolean }) {
  return (
    <Link
      href={`/clients/${row.id}`}
      className="flex items-center justify-between gap-3 rounded-ros-md border border-slate-100 dark:border-slate-800 hover:border-slate-300 hover:bg-slate-50/70 px-3 py-2 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {rank && (
          <span className="w-5 h-5 shrink-0 rounded-ros-full bg-slate-100 text-slate-500 dark:text-slate-400 text-[10px] font-semibold flex items-center justify-center">
            {rank}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{row.name}</p>
          <p className="text-[11px] text-slate-400">
            {row.stats.submittedPlus} submitted · {row.stats.placed} placed
          </p>
        </div>
      </div>
      <span
        className={`text-sm font-semibold shrink-0 ${positive ? "text-emerald-600" : "text-rose-500"}`}
      >
        {pct(row.stats.subToInterviewRate)}
      </span>
    </Link>
  );
}
