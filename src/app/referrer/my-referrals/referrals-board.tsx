"use client";

import { useMemo, useState } from "react";
import ReferralJourneyRow, { type ReferralJourneyData } from "./referral-journey-row";
import { referralGroup, type ReferralGroup } from "@/lib/referral-stages";

type Filter = "all" | ReferralGroup;

export default function ReferralsBoard({ referrals }: { referrals: ReferralJourneyData[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const counts = useMemo(() => {
    const c = { all: referrals.length, progress: 0, joined: 0, ended: 0 };
    for (const r of referrals) c[referralGroup(r.status)] += 1;
    return c;
  }, [referrals]);
  const shown = referrals.filter((r) => filter === "all" || referralGroup(r.status) === filter);

  const tiles: { key: Filter; label: string; value: number; tone: string }[] = [
    { key: "all", label: "Referred", value: counts.all, tone: "text-slate-900" },
    { key: "progress", label: "In progress", value: counts.progress, tone: "text-indigo-600" },
    { key: "joined", label: "Joined", value: counts.joined, tone: "text-emerald-600" },
    { key: "ended", label: "Closed", value: counts.ended, tone: "text-slate-500" },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-xl border bg-white p-4 text-left transition-shadow hover:shadow-sm ${filter === t.key ? "border-slate-900 ring-1 ring-slate-900" : "border-slate-200"}`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t.label}</div>
            <div className={`mt-1 text-[26px] font-bold leading-none ${t.tone}`}>{t.value}</div>
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {shown.length === 0 ? <p className="px-5 py-10 text-center text-[13px] text-slate-400">Nothing here yet.</p> : shown.map((r) => <ReferralJourneyRow key={r.id} referral={r} />)}
      </div>
    </div>
  );
}
