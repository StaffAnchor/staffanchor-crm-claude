"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ReferralsStatusControl from "./referrals-status-control";
import ReferralDetailsToggle, { type ReferralDetails } from "./referral-details-toggle";
import { referralGroup, type ReferralGroup } from "@/lib/referral-stages";

export type AdminReferral = {
  id: string;
  candidate_name: string;
  status: string;
  created_at: string;
  referrer_name: string;
  role_title: string;
  client_name: string;
  ctc: string | null;
  details: ReferralDetails;
};

type Filter = "all" | "new" | ReferralGroup;

export default function ReferralsAdmin({ referrals }: { referrals: AdminReferral[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());

  const counts = useMemo(() => {
    const c = { all: referrals.length, new: 0, progress: 0, joined: 0, ended: 0 };
    for (const r of referrals) {
      if (r.status === "submitted") c.new += 1;
      c[referralGroup(r.status)] += 1;
    }
    return c;
  }, [referrals]);

  const shown = referrals.filter((r) => {
    if (filter === "new" && r.status !== "submitted") return false;
    if (filter !== "all" && filter !== "new" && referralGroup(r.status) !== filter) return false;
    const q = query.trim().toLowerCase();
    return !q || [r.candidate_name, r.referrer_name, r.role_title, r.client_name].some((v) => v.toLowerCase().includes(q));
  });

  const chips: { key: Filter; label: string; tone?: string }[] = [
    { key: "all", label: `All ${counts.all}` },
    { key: "new", label: `Needs screening ${counts.new}`, tone: counts.new ? "text-amber-700" : undefined },
    { key: "progress", label: `In progress ${counts.progress}` },
    { key: "joined", label: `Joined ${counts.joined}` },
    { key: "ended", label: `Closed ${counts.ended}` },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
              filter === c.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : `border-slate-200 hover:border-slate-300 dark:border-slate-700 ${c.tone ?? "text-slate-600 dark:text-slate-300"}`
            }`}
          >
            {c.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search candidate, referrer or role"
            className="w-64 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-2 text-[12px] dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Candidate</th>
              <th className="px-3 py-2 text-left font-medium">Referred by</th>
              <th className="px-3 py-2 text-left font-medium">Role</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((r) => {
              const waiting = r.status === "submitted" ? Math.floor((now - new Date(r.created_at).getTime()) / 86_400_000) : 0;
              return (
                <tr key={r.id}>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{r.candidate_name}</div>
                    <div className="text-[11px] text-slate-400" suppressHydrationWarning>
                      {new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {waiting >= 2 && <span className={`ml-1.5 font-medium ${waiting >= 5 ? "text-rose-600" : "text-amber-600"}`}>· waiting {waiting} days</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{r.referrer_name}</td>
                  <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                    {r.role_title}
                    <div className="text-[11px] text-slate-400">
                      {r.client_name}
                      {r.ctc ? ` · ${r.ctc}` : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <ReferralsStatusControl referralId={r.id} currentStatus={r.status} />
                  </td>
                  <td className="px-3 py-2.5">
                    <ReferralDetailsToggle details={r.details} />
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  {referrals.length === 0 ? "No referrals yet." : "Nothing matches that filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
