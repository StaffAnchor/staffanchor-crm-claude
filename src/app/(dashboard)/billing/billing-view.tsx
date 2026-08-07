"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";

export type TrancheRow = {
  id: string;
  label: string;
  split_pct: number;
  amount_lakhs: number | null;
  due_date: string | null;
  status: string;
  invoiced_at: string | null;
  paid_at: string | null;
  role_title: string;
  client_name: string;
  candidate_name: string;
};

const STATUS_TONE: Record<string, BadgeTone> = { pending: "neutral", invoiced: "info", paid: "success" };

export default function BillingView({ initialRows, fetchError }: { initialRows: TrancheRow[]; fetchError: string | null }) {
  const [filter, setFilter] = useState<"all" | "pending" | "invoiced" | "paid">("all");

  const filtered = useMemo(
    () => (filter === "all" ? initialRows : initialRows.filter((r) => r.status === filter)),
    [initialRows, filter]
  );

  if (fetchError) return <p className="text-sm text-red-600">{fetchError}</p>;

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        {(["all", "pending", "invoiced", "paid"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium capitalize transition-colors ${
              filter === f
                ? "bg-teal-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No tranches here yet -- they're generated automatically once a candidate is marked placed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3">Candidate</th>
                <th className="py-2 pr-3">Mandate</th>
                <th className="py-2 pr-3">Tranche</th>
                <th className="py-2 pr-3">Amount</th>
                <th className="py-2 pr-3">Due</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <TrancheRowLine key={r.id} row={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TrancheRowLine({ row }: { row: TrancheRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function advance() {
    const next = row.status === "pending" ? "invoiced" : row.status === "invoiced" ? "paid" : null;
    if (!next) return;
    setSaving(true);
    const patch: Record<string, string> = { status: next };
    if (next === "invoiced") patch.invoiced_at = new Date().toISOString();
    if (next === "paid") patch.paid_at = new Date().toISOString();
    await supabase.from("placement_fee_tranches").update(patch).eq("id", row.id);
    setSaving(false);
    router.refresh();
  }

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">{row.candidate_name}</td>
      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
        {row.role_title} · {row.client_name}
      </td>
      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
        {row.label} ({row.split_pct}%)
      </td>
      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200 tabular-nums">
        {row.amount_lakhs !== null ? `₹${row.amount_lakhs}L` : "—"}
      </td>
      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
        {row.due_date ? new Date(row.due_date).toLocaleDateString() : "—"}
      </td>
      <td className="py-2 pr-3">
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"} size="sm">
          {row.status}
        </Badge>
      </td>
      <td className="py-2 pr-3">
        {row.status !== "paid" && (
          <button
            onClick={advance}
            disabled={saving}
            className="text-[12px] text-blue-600 hover:underline disabled:opacity-40"
          >
            {saving ? "..." : row.status === "pending" ? "Mark invoiced" : "Mark paid"}
          </button>
        )}
      </td>
    </tr>
  );
}
