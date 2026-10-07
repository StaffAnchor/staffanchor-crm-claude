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
  tos_accepted_at: string | null;
  invite_token_expires_at: string | null;
};

type ResendResult = { signupUrl: string; emailSent: boolean; email?: string };

const STATUS_TONE: Record<string, string> = {
  applied: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-700",
  deactivated: "bg-slate-100 text-slate-500",
};

export default function ReferrersTable({ referrers }: { referrers: Referrer[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resent, setResent] = useState<Record<string, ResendResult | { error: string }>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  async function resendLink(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/referrers/${id}/resend-invite`, { method: "POST" });
      const data = await res.json();
      setResent((cur) => ({ ...cur, [id]: res.ok ? data : { error: data.error ?? "Couldn't resend the link" } }));
      if (res.ok) router.refresh();
    } catch {
      setResent((cur) => ({ ...cur, [id]: { error: "Couldn't resend the link" } }));
    } finally {
      setBusyId(null);
    }
  }

  async function copyLink(id: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  // The state of the joining link for an approved referrer.
  function linkState(r: Referrer): { label: string; tone: string } {
    if (r.tos_accepted_at) return { label: "Joined", tone: "text-emerald-700" };
    if (!r.invite_token_expires_at) return { label: "No active link", tone: "text-amber-700" };
    const days = Math.ceil((new Date(r.invite_token_expires_at).getTime() - now) / 86_400_000);
    return days > 0
      ? { label: `Not joined yet · link valid ${days} more day${days === 1 ? "" : "s"}`, tone: "text-slate-600 dark:text-slate-300" }
      : { label: "Not joined yet · link expired", tone: "text-rose-700" };
  }

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
            <th className="text-left font-medium px-3 py-2">Joining link</th>
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
              <td className="px-3 py-2">
                {r.status !== "approved" ? (
                  <span className="text-slate-400">—</span>
                ) : (
                  <div className="space-y-1">
                    <p className={`text-[12px] ${linkState(r).tone}`} suppressHydrationWarning>
                      {linkState(r).label}
                    </p>
                    {!r.tos_accepted_at && (
                      <button
                        disabled={busyId === r.id}
                        onClick={() => resendLink(r.id)}
                        className="rounded-md border border-slate-300 px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        {busyId === r.id ? "Sending…" : "Resend joining link"}
                      </button>
                    )}
                    {(() => {
                      const out = resent[r.id];
                      if (!out) return null;
                      if ("error" in out) return <p className="text-[12px] text-rose-600">{out.error}</p>;
                      return out.emailSent ? (
                        <p className="text-[12px] text-emerald-700">Sent to {out.email ?? r.email}. The old link no longer works.</p>
                      ) : (
                        <p className="text-[12px] text-amber-700">
                          New link created but the email couldn&apos;t be sent.{" "}
                          <button className="font-medium underline" onClick={() => copyLink(r.id, out.signupUrl)}>
                            {copied === r.id ? "Copied" : "Copy link"}
                          </button>{" "}
                          and send it yourself.
                        </p>
                      );
                    })()}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
