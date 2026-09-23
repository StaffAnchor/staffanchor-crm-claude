"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Payout = {
  id: string;
  slab_amount: number | null;
  fee_received_amount: number | null;
  computed_payout_amount: number | null;
  status: string;
  tds_amount: number | null;
  net_amount: number | null;
  referral_id: string;
  candidate_name: string;
};

const STATUS_TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-500",
  eligible: "bg-amber-50 text-amber-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export default function PayoutsPanel({ payouts }: { payouts: Payout[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ feeReceivedAmount: "", tdsAmount: "", status: "pending" });

  function startEdit(p: Payout) {
    setEditingId(p.id);
    setForm({
      feeReceivedAmount: p.fee_received_amount != null ? String(p.fee_received_amount) : "",
      tdsAmount: p.tds_amount != null ? String(p.tds_amount) : "",
      status: p.status,
    });
  }

  async function save(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-circle/payouts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeReceivedAmount: form.feeReceivedAmount || null,
          tdsAmount: form.tdsAmount || null,
          status: form.status,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      setEditingId(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (payouts.length === 0) {
    return <p className="text-[13px] text-slate-500 dark:text-slate-400">No payouts yet -- these get created automatically when a referral reaches &quot;Joined&quot;.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full text-[13px]">
        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
          <tr>
            <th className="text-left font-medium px-3 py-2">Candidate</th>
            <th className="text-left font-medium px-3 py-2">Slab</th>
            <th className="text-left font-medium px-3 py-2">Fee received</th>
            <th className="text-left font-medium px-3 py-2">Computed payout</th>
            <th className="text-left font-medium px-3 py-2">TDS</th>
            <th className="text-left font-medium px-3 py-2">Status</th>
            <th className="text-right font-medium px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {payouts.map((p) =>
            editingId === p.id ? (
              <tr key={p.id} className="bg-slate-50/50 dark:bg-slate-800/30">
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{p.candidate_name}</td>
                <td className="px-3 py-2 text-slate-500">{p.slab_amount != null ? `₹${p.slab_amount.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-3 py-2">
                  <input
                    value={form.feeReceivedAmount}
                    onChange={(e) => setForm({ ...form, feeReceivedAmount: e.target.value })}
                    placeholder="Fee received"
                    className="w-28 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
                  />
                </td>
                <td className="px-3 py-2 text-slate-400">auto</td>
                <td className="px-3 py-2">
                  <input
                    value={form.tdsAmount}
                    onChange={(e) => setForm({ ...form, tdsAmount: e.target.value })}
                    placeholder="TDS"
                    className="w-24 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
                  >
                    <option value="pending">Pending</option>
                    <option value="eligible">Eligible</option>
                    <option value="paid">Paid</option>
                  </select>
                </td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button disabled={busy} onClick={() => save(p.id)} className="rounded-md bg-blue-600 px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-50">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-[12px] text-slate-500">
                    Cancel
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={p.id}>
                <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{p.candidate_name}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.slab_amount != null ? `₹${p.slab_amount.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.fee_received_amount != null ? `₹${p.fee_received_amount.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.computed_payout_amount != null ? `₹${p.computed_payout_amount.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{p.tds_amount != null ? `₹${p.tds_amount.toLocaleString("en-IN")}` : "—"}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => startEdit(p)} className="text-[12px] font-medium text-blue-600">
                    Edit
                  </button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
