"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Slab = {
  id: string;
  ctc_band_min: number;
  ctc_band_max: number | null;
  payout_amount: number;
  active: boolean;
};

function formatLakhs(n: number | null) {
  if (n == null) return "Open";
  return `₹${(n / 100000).toFixed(1)}L`;
}

export default function PayoutSlabsPanel({ slabs }: { slabs: Slab[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ctcBandMin: "", ctcBandMax: "", payoutAmount: "" });
  const [error, setError] = useState<string | null>(null);

  async function toggleActive(id: string, active: boolean) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/sales-circle/slabs/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function addSlab() {
    setError(null);
    if (!form.ctcBandMin || !form.payoutAmount) {
      setError("Min CTC and payout amount are required");
      return;
    }
    setBusyId("new");
    try {
      const res = await fetch("/api/admin/sales-circle/slabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setForm({ ctcBandMin: "", ctcBandMax: "", payoutAmount: "" });
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
        <table className="w-full text-[13px]">
          <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-left font-medium px-3 py-2">CTC band</th>
              <th className="text-left font-medium px-3 py-2">Payout</th>
              <th className="text-left font-medium px-3 py-2">Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {slabs.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                  {formatLakhs(s.ctc_band_min)} – {formatLakhs(s.ctc_band_max)}
                </td>
                <td className="px-3 py-2 text-slate-700 dark:text-slate-200">₹{s.payout_amount.toLocaleString("en-IN")}</td>
                <td className="px-3 py-2">
                  <button
                    disabled={busyId === s.id}
                    onClick={() => toggleActive(s.id, !s.active)}
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      s.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {s.active ? "Active" : "Inactive"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm ? (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <label className="text-[12px] text-slate-500">
            Min CTC (₹)
            <input
              value={form.ctcBandMin}
              onChange={(e) => setForm({ ...form, ctcBandMin: e.target.value })}
              className="block mt-1 w-32 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
            />
          </label>
          <label className="text-[12px] text-slate-500">
            Max CTC (₹, blank = open)
            <input
              value={form.ctcBandMax}
              onChange={(e) => setForm({ ...form, ctcBandMax: e.target.value })}
              className="block mt-1 w-32 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
            />
          </label>
          <label className="text-[12px] text-slate-500">
            Payout (₹)
            <input
              value={form.payoutAmount}
              onChange={(e) => setForm({ ...form, payoutAmount: e.target.value })}
              className="block mt-1 w-32 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-[12px]"
            />
          </label>
          <button
            disabled={busyId === "new"}
            onClick={addSlab}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          >
            Save slab
          </button>
          <button onClick={() => setShowForm(false)} className="text-[12px] text-slate-500">
            Cancel
          </button>
          {error && <p className="w-full text-[12px] text-rose-600">{error}</p>}
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="text-[12px] font-medium text-blue-600">
          + Add slab
        </button>
      )}
    </div>
  );
}
