import { TrendingUp, Target, Award, Briefcase } from "lucide-react";
import { STAGE_ORDER, STAGE_LABELS, pct, type FunnelStats } from "../funnel-utils";

export default function ClientFunnelPanel({ stats }: { stats: FunnelStats }) {
  const maxCount = Math.max(1, ...STAGE_ORDER.map((s) => stats.byStage[s] ?? 0));

  const rateCards = [
    {
      icon: TrendingUp,
      label: "Submitted → Interview",
      value: stats.subToInterviewRate,
      sub: `${stats.interviewPlus} of ${stats.submittedPlus} submitted`,
    },
    {
      icon: Target,
      label: "Interview → Offer",
      value: stats.interviewToOfferRate,
      sub: `${stats.offerPlus} of ${stats.interviewPlus} interviewed`,
    },
    {
      icon: Award,
      label: "Offer → Placed",
      value: stats.offerToPlacedRate,
      sub: `${stats.placed} of ${stats.offerPlus} offers`,
    },
    {
      icon: Briefcase,
      label: "Overall submit → placed",
      value: stats.subToPlacedRate,
      sub: `${stats.placed} of ${stats.submittedPlus} submitted`,
    },
  ];

  if (stats.total === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Submission funnel</h2>
        <p className="text-[13px] text-slate-400">
          No candidates linked to this client's mandates yet — conversion analysis will appear once
          candidates are submitted.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-900">Submission funnel</h2>
        {stats.rejected > 0 && (
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">
            {stats.rejected} rejected
          </span>
        )}
      </div>

      <div className="space-y-2 mb-5">
        {STAGE_ORDER.map((s) => {
          const count = stats.byStage[s] ?? 0;
          const widthPct = (count / maxCount) * 100;
          return (
            <div key={s} className="flex items-center gap-2.5">
              <span className="w-[72px] shrink-0 text-[11px] text-slate-500">{STAGE_LABELS[s]}</span>
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500/80"
                  style={{ width: `${count > 0 ? Math.max(widthPct, 4) : 0}%` }}
                />
              </div>
              <span className="w-5 shrink-0 text-right text-[11px] font-medium text-slate-700">{count}</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {rateCards.map((r) => (
          <div key={r.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1">
              <r.icon className="w-3.5 h-3.5" />
              <span className="text-[10.5px] font-medium uppercase tracking-wide">{r.label}</span>
            </div>
            <p className="text-lg font-semibold text-slate-900 leading-none">{pct(r.value)}</p>
            <p className="text-[11px] text-slate-400 mt-1">{r.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
