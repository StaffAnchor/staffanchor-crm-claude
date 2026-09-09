"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

type InvoiceClient = { id: string; name: string; created_via: string } | null;
type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  invoice_date: string | null;
  gross_amount: number | null;
  gst_amount: number | null;
  net_amount: number | null;
  needs_review: boolean;
  review_notes: string | null;
  parse_error: string | null;
  original_filename: string | null;
  clients: InvoiceClient;
};
type MonthRollup = { month: string; gross: number; net: number; count: number };
type YearRollup = { year: string; gross: number; net: number; count: number };

type FileStatus = { name: string; status: "pending" | "uploading" | "done" | "error"; message?: string };

const fmt = (n: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);

// Bulk-import UI for backfilling 1.5-2 years of pre-CRM invoices: pick a
// batch of PDFs, each gets uploaded + AI-parsed one at a time (sequential,
// not parallel -- avoids hammering the free-tier AI providers that also
// serve every other backfill in this app), then lands in the review table
// below flagged if anything couldn't be confidently parsed. Month-on-month
// and annual gross/net rollups are computed server-side from every row on
// file, not just what's currently visible in the table.
export default function InvoiceImportView() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [monthly, setMonthly] = useState<MonthRollup[]>([]);
  const [annual, setAnnual] = useState<YearRollup[]>([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showOnlyReview, setShowOnlyReview] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/invoices");
      const data = await res.json();
      if (res.ok) {
        setInvoices(data.invoices ?? []);
        setMonthly(data.monthly ?? []);
        setAnnual(data.annual ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList).filter((f) => /\.pdf$/i.test(f.name));
    if (picked.length === 0) return;

    setUploading(true);
    setFiles(picked.map((f) => ({ name: f.name, status: "pending" })));

    for (let i = 0; i < picked.length; i++) {
      setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "uploading" } : f)));
      try {
        const formData = new FormData();
        formData.append("file", picked[i]);
        const res = await fetch("/api/admin/invoices/import", { method: "POST", body: formData });
        const data = await res.json();
        if (!res.ok || data.error) {
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "error", message: data.error ?? "Failed" } : f)));
        } else if (data.needsReview) {
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "done", message: "Imported -- needs review" } : f)));
        } else {
          setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "done", message: "Imported" } : f)));
        }
      } catch {
        setFiles((prev) => prev.map((f, idx) => (idx === i ? { ...f, status: "error", message: "Request failed" } : f)));
      }
    }
    setUploading(false);
    load();
  }

  async function saveRow(row: InvoiceRow, patch: Partial<InvoiceRow> & { client_id?: string | null }) {
    await fetch("/api/admin/invoices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, needs_review: false, ...patch }),
    });
    load();
  }

  const reviewRows = invoices.filter((r) => r.needs_review);
  const displayRows = showOnlyReview ? reviewRows : invoices;

  return (
    <div className="space-y-6">
      <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-5 text-center">
        <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-2">
          Upload past invoice PDFs to backfill billing history. Each one is parsed automatically -- client, amount, GST split, date.
        </p>
        <label className="inline-block cursor-pointer text-[12.5px] font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-ros-md px-4 py-2 transition-colors">
          {uploading ? "Importing…" : "Choose PDF files"}
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
        {files.length > 0 && (
          <div className="mt-4 text-left max-w-xl mx-auto space-y-1">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-[12px] gap-2">
                <span className="truncate text-slate-600 dark:text-slate-400">{f.name}</span>
                <span
                  className={
                    f.status === "error"
                      ? "text-red-600"
                      : f.status === "done"
                        ? "text-emerald-600"
                        : "text-slate-400"
                  }
                >
                  {f.status === "uploading" ? "Uploading…" : f.status === "pending" ? "Queued" : f.message ?? f.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!loading && annual.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Annual</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {annual.map((y) => (
              <div key={y.year} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <p className="text-[11px] text-slate-400">{y.year} · {y.count} invoices</p>
                <p className="text-[15px] font-bold text-slate-900 dark:text-slate-100 mt-0.5">{fmt(y.gross)}</p>
                <p className="text-[11px] text-slate-500">net {fmt(y.net)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && monthly.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Month on month</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-3">Month</th>
                  <th className="py-2 pr-3">Invoices</th>
                  <th className="py-2 pr-3">Gross</th>
                  <th className="py-2 pr-3">Net</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={m.month} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-1.5 pr-3 text-slate-700 dark:text-slate-300">{m.month}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{m.count}</td>
                    <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-200 tabular-nums">{fmt(m.gross)}</td>
                    <td className="py-1.5 pr-3 text-slate-500 tabular-nums">{fmt(m.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Imported invoices {reviewRows.length > 0 && `(${reviewRows.length} need review)`}
          </p>
          {reviewRows.length > 0 && (
            <button
              onClick={() => setShowOnlyReview((v) => !v)}
              className="text-[12px] text-blue-600 hover:underline"
            >
              {showOnlyReview ? "Show all" : "Show only needs-review"}
            </button>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-slate-400 py-6 text-center">Loading…</p>
        ) : displayRows.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No invoices imported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Invoice #</th>
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Gross</th>
                  <th className="py-2 pr-3">GST</th>
                  <th className="py-2 pr-3">Net</th>
                  <th className="py-2 pr-3">File</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => (
                  <InvoiceLine key={r.id} row={r} onSave={saveRow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InvoiceLine({
  row,
  onSave,
}: {
  row: InvoiceRow;
  onSave: (row: InvoiceRow, patch: Partial<InvoiceRow> & { client_id?: string | null }) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [clientName, setClientName] = useState(row.clients?.name ?? "");
  const [invoiceDate, setInvoiceDate] = useState(row.invoice_date ?? "");
  const [gross, setGross] = useState(row.gross_amount?.toString() ?? "");
  const [net, setNet] = useState(row.net_amount?.toString() ?? "");

  if (editing) {
    return (
      <tr className="border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-950/10">
        <td className="py-1.5 pr-3">
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className="w-32 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
            placeholder="Client name (unlinked)"
          />
        </td>
        <td className="py-1.5 pr-3 text-slate-500">{row.invoice_number ?? "—"}</td>
        <td className="py-1.5 pr-3">
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="rounded border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
          />
        </td>
        <td className="py-1.5 pr-3">
          <input
            value={gross}
            onChange={(e) => setGross(e.target.value)}
            className="w-20 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
          />
        </td>
        <td className="py-1.5 pr-3 text-slate-500">{row.gst_amount ?? "—"}</td>
        <td className="py-1.5 pr-3">
          <input
            value={net}
            onChange={(e) => setNet(e.target.value)}
            className="w-20 rounded border border-slate-300 dark:border-slate-700 bg-transparent px-1.5 py-1 text-[12px]"
          />
        </td>
        <td className="py-1.5 pr-3 text-slate-400">{row.original_filename ?? "—"}</td>
        <td className="py-1.5 pr-3">
          <button
            onClick={() => {
              onSave(row, {
                invoice_date: invoiceDate || null,
                gross_amount: gross ? Number(gross) : null,
                net_amount: net ? Number(net) : null,
              });
              setEditing(false);
            }}
            className="text-[12px] text-blue-600 hover:underline mr-2"
          >
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-[12px] text-slate-400 hover:underline">
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-b border-slate-100 dark:border-slate-800 ${row.needs_review ? "bg-amber-50/30 dark:bg-amber-950/5" : ""}`}>
      <td className="py-1.5 pr-3 text-slate-800 dark:text-slate-200">
        {row.clients?.name ?? "—"}
        {row.clients?.created_via === "invoice_import" && (
          <Badge tone="neutral" size="sm" className="ml-1.5" title="Auto-created from an imported invoice, not yet reviewed">
            Imported
          </Badge>
        )}
        {row.needs_review && (
          <Badge tone="warning" size="sm" className="ml-1.5">
            Needs review
          </Badge>
        )}
      </td>
      <td className="py-1.5 pr-3 text-slate-500">{row.invoice_number ?? "—"}</td>
      <td className="py-1.5 pr-3 text-slate-500">{row.invoice_date ?? "—"}</td>
      <td className="py-1.5 pr-3 font-medium text-slate-800 dark:text-slate-200 tabular-nums">{fmt(row.gross_amount)}</td>
      <td className="py-1.5 pr-3 text-slate-500 tabular-nums">{fmt(row.gst_amount)}</td>
      <td className="py-1.5 pr-3 text-slate-500 tabular-nums">{fmt(row.net_amount)}</td>
      <td className="py-1.5 pr-3 text-slate-400 truncate max-w-[140px]">{row.original_filename ?? "—"}</td>
      <td className="py-1.5 pr-3">
        <button onClick={() => setEditing(true)} className="text-[12px] text-blue-600 hover:underline">
          Edit
        </button>
      </td>
    </tr>
  );
}
