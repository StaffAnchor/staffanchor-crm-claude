"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUS_OPTIONS = [
  "submitted", "screened", "candidate_interested", "submitted_to_client", "interviewing",
  "offered", "joined", "ninety_days_completed", "payment_received", "payout_processed",
  "not_suitable", "candidate_declined", "dropped_out", "left_before_90_days",
];

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  screened: "Screened",
  candidate_interested: "Candidate interested",
  submitted_to_client: "Submitted to client",
  interviewing: "Interviewing",
  offered: "Offered",
  joined: "Joined",
  ninety_days_completed: "90 days completed",
  payment_received: "Payment received",
  payout_processed: "Payout processed",
  not_suitable: "Not suitable",
  candidate_declined: "Candidate declined",
  dropped_out: "Dropped out",
  left_before_90_days: "Left before 90 days",
};

export default function ReferralsStatusControl({ referralId, currentStatus }: { referralId: string; currentStatus: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function updateStatus(status: string) {
    if (status === currentStatus) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-circle/referrals/${referralId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      disabled={busy}
      value={currentStatus}
      onChange={(e) => updateStatus(e.target.value)}
      className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
