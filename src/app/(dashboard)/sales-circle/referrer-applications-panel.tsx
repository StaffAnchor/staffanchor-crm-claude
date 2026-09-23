"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  linkedin_url: string | null;
  current_company: string | null;
  designation: string | null;
  years_of_experience: number | null;
  sectors: string[] | null;
  city: string | null;
  created_at: string;
};

export default function ReferrerApplicationsPanel({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function approve(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/referrers/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to approve");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(id: string) {
    const reason = window.prompt("Rejection reason (optional):") ?? "";
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/referrers/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reject");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reject");
    } finally {
      setBusyId(null);
    }
  }

  if (applications.length === 0) {
    return <p className="text-[13px] text-slate-500 dark:text-slate-400">No pending applications.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-[13px] text-rose-600">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2">Contact</th>
              <th className="text-left font-medium px-3 py-2">Current role</th>
              <th className="text-left font-medium px-3 py-2">Sectors</th>
              <th className="text-left font-medium px-3 py-2">City</th>
              <th className="text-right font-medium px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {applications.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">
                  {a.full_name}
                  {a.linkedin_url && (
                    <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="block text-[11px] text-blue-600">
                      LinkedIn
                    </a>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  <div>{a.email}</div>
                  <div className="text-slate-400">{a.phone ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                  <div>{a.designation ?? "—"}</div>
                  <div className="text-slate-400">{a.current_company ?? "—"}</div>
                </td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{(a.sectors ?? []).join(", ") || "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{a.city ?? "—"}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button
                    disabled={busyId === a.id}
                    onClick={() => approve(a.id)}
                    className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    disabled={busyId === a.id}
                    onClick={() => reject(a.id)}
                    className="rounded-md border border-slate-300 dark:border-slate-600 px-2.5 py-1 text-[12px] font-medium text-slate-600 dark:text-slate-300 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
