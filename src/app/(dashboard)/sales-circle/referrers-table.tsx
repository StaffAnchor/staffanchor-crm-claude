"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Referrer = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  tier: string;
  current_company: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  applied: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  deactivated: "bg-slate-100 text-slate-500",
};

export default function ReferrersTable({ referrers }: { referrers: Referrer[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function setTier(id: string, tier: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/sales-circle/referrers/${id}/tier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  if (referrers.length === 0) {
    return <p className="text-[13px] text-slate-500 dark:text-slate-400">No referrers yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left font-medium px-3 py-2">Name</th>
            <th className="text-left font-medium px-3 py-2">Company</th>
            <th className="text-left font-medium px-3 py-2">Status</th>
            <th className="text-left font-medium px-3 py-2">Tier</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {referrers.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                {r.full_name}
                <div className="text-[11px] text-slate-400">{r.email}</div>
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.current_company ?? "—"}</td>
              <td className="px-3 py-2">
                <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[r.status] ?? "bg-slate-100 text-slate-500"}`}>
                  {r.status}
                </span>
              </td>
              <td className="px-3 py-2">
                {r.status === "approved" ? (
                  <select
                    disabled={busyId === r.id}
                    value={r.tier}
                    onChange={(e) => setTier(r.id, e.target.value)}
                    className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
                  >
                    <option value="member">Member</option>
                    <option value="trusted">Trusted</option>
                  </select>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
