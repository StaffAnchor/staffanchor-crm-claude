"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const STATUS_OPTIONS = [
  { value: "referred", label: "Referred" },
  { value: "registered", label: "Registered" },
  { value: "submitted", label: "Submitted to a client" },
  { value: "interviewing", label: "Interviewing" },
  { value: "placed", label: "Placed — payout pending" },
  { value: "paid", label: "Paid out" },
  { value: "not_selected", label: "Not selected" },
];

export default function ReferralRowActions({
  referralId,
  currentStatus,
  currentReward,
}: {
  referralId: string;
  currentStatus: string;
  currentReward: number | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [status, setStatus] = useState(currentStatus);
  const [reward, setReward] = useState(currentReward != null ? String(currentReward) : "");
  const [saving, setSaving] = useState(false);

  async function persist(patch: Record<string, unknown>) {
    setSaving(true);
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { ...patch, updated_at: now };
    if (patch.status === "placed") update.placed_at = now;
    if (patch.status === "paid") update.paid_at = now;
    await supabase.from("referrals").update(update).eq("id", referralId);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={status}
        disabled={saving}
        onChange={(e) => {
          setStatus(e.target.value);
          persist({ status: e.target.value });
        }}
        className="rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        {STATUS_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <span className="text-xs text-slate-400">₹</span>
        <input
          value={reward}
          disabled={saving}
          onChange={(e) => setReward(e.target.value)}
          onBlur={() => {
            const num = reward.trim() === "" ? null : Number(reward);
            persist({ reward_amount: num });
          }}
          placeholder="0"
          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
        />
      </div>
    </div>
  );
}
