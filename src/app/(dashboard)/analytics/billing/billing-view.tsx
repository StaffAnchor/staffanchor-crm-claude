"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import InvoicePreviewModal from "./invoice-preview-modal";

export type TrancheRow = {
  id: string;
  label: string;
  split_pct: number;
  amount_lakhs: number | null;
  due_date: string | null;
  status: string;
  proforma_sent_at: string | null;
  payment_received_at: string | null;
  final_invoiced_at: string | null;
  proforma_invoice_number: string | null;
  final_invoice_number: string | null;
  role_title: string;
  client_name: string;
  has_client_link: boolean;
  candidate_name: string;
};

// Same 18% assumption the Placements page uses for its "Final Billing
// Value (incl. GST)" column -- kept as one constant so both pages always
// show the same revenue number for the same placement, per the "Billing
// and Placements should match" ask. amount_lakhs (misleadingly named --
// holds a plain rupee amount, not lakhs) is the pre-GST tranche value;
// everything shown here is now GST-inclusive to match.
const GST_RATE = 0.18;

function inr(n: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function withGst(amount: number | null): number | null {
  return amount == null ? null : Math.round(amount * (1 + GST_RATE));
}

// Placement -> Joining (tranche auto-generated) -> Proforma Invoice ->
// Payment -> Final Invoice, per how this firm's clients actually pay --
// most require a proforma before releasing payment, with the tax invoice
// only cut once payment is confirmed. Old pending/invoiced/paid states had
// no slot for the proforma step or a "paid but final invoice not cut yet"
// state.
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  proforma_sent: "Proforma sent",
  payment_received: "Payment received",
  final_invoiced: "Final invoice issued",
  cancelled: "Cancelled",
};
const STATUS_TONE: Record<string, BadgeTone> = {
  pending: "neutral",
  proforma_sent: "info",
  payment_received: "warning",
  final_invoiced: "success",
  cancelled: "danger",
};
const NEXT_STATUS: Record<string, string | null> = {
  pending: "proforma_sent",
  proforma_sent: "payment_received",
  payment_received: "final_invoiced",
  final_invoiced: null,
  cancelled: null,
};
const ADVANCE_LABEL: Record<string, string> = {
  pending: "Mark proforma sent",
  proforma_sent: "Mark payment received",
  payment_received: "Mark final invoice issued",
};

export default function BillingView({ initialRows, fetchError }: { initialRows: TrancheRow[]; fetchError: string | null }) {
  const [filter, setFilter] = useState<"all" | "pending" | "proforma_sent" | "payment_received" | "final_invoiced">("all");

  const filtered = useMemo(
    () => (filter === "all" ? initialRows : initialRows.filter((r) => r.status === filter)),
    [initialRows, filter]
  );

  const totals = useMemo(() => {
    const live = initialRows.filter((r) => r.status !== "cancelled");
    const sum = (rows: TrancheRow[]) => rows.reduce((acc, r) => acc + (withGst(r.amount_lakhs) ?? 0), 0);
    return {
      total: sum(live),
      pending: sum(live.filter((r) => r.status === "pending")),
      inProgress: sum(live.filter((r) => r.status === "proforma_sent" || r.status === "payment_received")),
      invoiced: sum(live.filter((r) => r.status === "final_invoiced")),
    };
  }, [initialRows]);

  if (fetchError) return <p className="text-sm text-red-600">{fetchError}</p>;

  return (
    <div>
      <p className="text-[11px] text-slate-400 mb-3">
        Amounts below include 18% GST, matching the Final Billing Value shown on Placements.
      </p>
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "Total (incl. GST)", value: totals.total },
          { label: "Pending", value: totals.pending },
          { label: "Proforma / Payment", value: totals.inProgress },
          { label: "Final invoiced", value: totals.invoiced },
        ].map((t) => (
          <div key={t.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
            <p className="text-[11px] text-slate-400 uppercase tracking-wide">{t.label}</p>
            <p className="text-[16px] font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">{inr(t.value)}</p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        {(["all", "pending", "proforma_sent", "payment_received", "final_invoiced"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
              filter === f
                ? "bg-teal-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No tranches here yet -- they&apos;re generated automatically once a candidate is marked placed.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                <th className="py-2 pr-3">Candidate</th>
                <th className="py-2 pr-3">Mandate</th>
                <th className="py-2 pr-3">Tranche</th>
                <th className="py-2 pr-3">Amount (incl. GST)</th>
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

// Steps that actually mint a PDF (via /api/admin/tranches/[id]/generate-invoice)
// rather than just flipping a status flag -- "pending" generates the
// Proforma Invoice, "payment_received" generates the Tax (final) Invoice.
// "proforma_sent" -> "payment_received" is just confirming money landed, no
// document to produce for that step.
const GENERATES_DOC: Record<string, "proforma" | "final" | null> = {
  pending: "proforma",
  proforma_sent: null,
  payment_received: "final",
  final_invoiced: null,
};

function TrancheRowLine({ row }: { row: TrancheRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  async function advance() {
    const next = NEXT_STATUS[row.status];
    if (!next) return;
    const docKind = GENERATES_DOC[row.status];
    if (docKind) {
      // Document-producing steps go through the preview modal instead of
      // firing straight off -- lets the admin fill in anything missing
      // (DOJ, location, a corrected amount) or pick a different GST office
      // before a numbered invoice actually gets minted.
      setPreviewOpen(true);
      return;
    }
    setError(null);
    setSaving(true);
    const patch: Record<string, string> = { status: next };
    if (next === "payment_received") patch.payment_received_at = new Date().toISOString();
    await supabase.from("placement_fee_tranches").update(patch).eq("id", row.id);
    setSaving(false);
    router.refresh();
  }

  async function download(kind: "proforma" | "final") {
    const res = await fetch(`/api/admin/tranches/${row.id}/invoice-url?kind=${kind}`);
    const json = await res.json();
    if (json.ok && json.url) window.open(json.url, "_blank");
  }

  const gross = withGst(row.amount_lakhs);
  const docKind = GENERATES_DOC[row.status];
  const buttonLabel = docKind === "proforma" ? "Preview & generate Proforma" : docKind === "final" ? "Preview & generate Tax Invoice" : ADVANCE_LABEL[row.status];

  return (
    <>
    <tr className="border-b border-slate-100 dark:border-slate-800">
      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200">{row.candidate_name}</td>
      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
        {row.role_title} · {row.client_name}
      </td>
      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">
        {row.label} ({row.split_pct}%)
      </td>
      <td className="py-2 pr-3 font-medium text-slate-800 dark:text-slate-200 tabular-nums">{inr(gross)}</td>
      <td className="py-2 pr-3 text-slate-500 dark:text-slate-400">
        {row.due_date ? new Date(row.due_date).toLocaleDateString() : "—"}
      </td>
      <td className="py-2 pr-3">
        <Badge tone={STATUS_TONE[row.status] ?? "neutral"} size="sm">
          {STATUS_LABEL[row.status] ?? row.status}
        </Badge>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2 flex-wrap">
          {row.proforma_invoice_number && (
            <button onClick={() => download("proforma")} className="text-[11.5px] text-slate-500 hover:underline">
              {row.proforma_invoice_number}
            </button>
          )}
          {row.final_invoice_number && (
            <button onClick={() => download("final")} className="text-[11.5px] text-slate-500 hover:underline">
              {row.final_invoice_number}
            </button>
          )}
          {NEXT_STATUS[row.status] && !row.has_client_link && docKind ? (
            <span className="text-[11.5px] text-amber-600">Link mandate to a client first</span>
          ) : (
            NEXT_STATUS[row.status] && (
              <button
                onClick={advance}
                disabled={saving}
                className="text-[12px] text-blue-600 hover:underline disabled:opacity-40"
              >
                {saving ? "..." : buttonLabel}
              </button>
            )
          )}
        </div>
        {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
      </td>
    </tr>
    {previewOpen && docKind && (
      <InvoicePreviewModal
        trancheId={row.id}
        kind={docKind}
        onClose={() => setPreviewOpen(false)}
        onGenerated={() => {
          setPreviewOpen(false);
          router.refresh();
        }}
      />
    )}
    </>
  );
}
