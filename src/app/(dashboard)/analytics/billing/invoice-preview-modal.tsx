"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Preview-before-generate: fetches the exact PDF generate-invoice would
// produce (via preview-invoice, which mints no invoice number and writes
// nothing), lets the admin fix a missing DOJ / wrong location / corrected
// billing amount / wrong GST office right here, then only calls
// generate-invoice -- the numbered, sent document -- once they confirm.

type GstRegistration = {
  id: string;
  label: string;
  gstin: string;
  state_code: string;
  billing_address: string | null;
  is_default: boolean;
};

type FormState = {
  candidateName: string;
  designation: string;
  location: string;
  dateOfJoining: string; // yyyy-mm-dd or ""
  billingAmount: string;
  registrationId: string;
};

export default function InvoicePreviewModal({
  trancheId,
  kind,
  onClose,
  onGenerated,
}: {
  trancheId: string;
  kind: "proforma" | "final";
  onClose: () => void;
  onGenerated: (invoiceNumber: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<GstRegistration[]>([]);
  const [clientName, setClientName] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [generating, setGenerating] = useState(false);

  async function fetchPreview(overrides: Partial<FormState> = {}) {
    setLoading(true);
    setError(null);
    const base = form ?? {
      candidateName: "",
      designation: "",
      location: "",
      dateOfJoining: "",
      billingAmount: "",
      registrationId: "",
    };
    const next = { ...base, ...overrides };
    const res = await fetch(`/api/admin/tranches/${trancheId}/preview-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        overrides: {
          candidateName: next.candidateName || undefined,
          designation: next.designation || undefined,
          location: next.location || undefined,
          dateOfJoining: next.dateOfJoining || null,
          billingAmount: next.billingAmount ? Number(next.billingAmount) : undefined,
          registrationId: next.registrationId || undefined,
        },
      }),
    });
    const json = await res.json();
    setLoading(false);
    if (!json.ok) {
      setError(json.error ?? "Failed to build preview");
      return;
    }
    setPdfBase64(json.pdfBase64);
    setRegistrations(json.registrations);
    setClientName(json.client.name);
    setForm({
      candidateName: json.item.candidateName === "—" ? "" : json.item.candidateName,
      designation: json.item.designation ?? "",
      location: json.item.location ?? "",
      dateOfJoining: json.item.dateOfJoining ?? "",
      billingAmount: String(json.item.billingAmount ?? ""),
      registrationId: json.selectedRegistrationId,
    });
  }

  useEffect(() => {
    (async () => {
      await fetchPreview();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGenerate() {
    if (!form) return;
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/admin/tranches/${trancheId}/generate-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind,
        overrides: {
          candidateName: form.candidateName || undefined,
          designation: form.designation || undefined,
          location: form.location || undefined,
          dateOfJoining: form.dateOfJoining || null,
          billingAmount: form.billingAmount ? Number(form.billingAmount) : undefined,
          registrationId: form.registrationId || undefined,
        },
      }),
    });
    const json = await res.json();
    setGenerating(false);
    if (!json.ok) {
      setError(json.error ?? "Failed to generate invoice");
      return;
    }
    onGenerated(json.invoiceNumber);
  }

  const missing =
    form &&
    [
      !form.candidateName && "Candidate name",
      !form.designation && "Designation",
      !form.dateOfJoining && "Date of joining",
      (!form.billingAmount || Number(form.billingAmount) <= 0) && "Billing amount",
    ].filter(Boolean);

  // Portalled to document.body -- this component is invoked from inside a
  // <tr> (Billing table rows), and a fixed-position overlay div can't be a
  // valid child of <tbody>/<tr> without breaking table layout/hydration.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-4xl max-h-full flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Preview {kind === "proforma" ? "Proforma Invoice" : "Tax Invoice"}
            </h2>
            <p className="text-[11.5px] text-slate-400">{clientName || "Loading…"}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 text-sm">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-0">
          <div className="p-5 space-y-3 border-r border-slate-100 dark:border-slate-800">
            {missing && missing.length > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 text-[11.5px] text-amber-700 dark:text-amber-400">
                Missing: {missing.join(", ")}
              </div>
            )}
            <Field label="Candidate name">
              <input
                value={form?.candidateName ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, candidateName: e.target.value } : f))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              />
            </Field>
            <Field label="Designation">
              <input
                value={form?.designation ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, designation: e.target.value } : f))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              />
            </Field>
            <Field label="Location">
              <input
                value={form?.location ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, location: e.target.value } : f))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              />
            </Field>
            <Field label="Date of joining">
              <input
                type="date"
                value={form?.dateOfJoining ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, dateOfJoining: e.target.value } : f))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              />
            </Field>
            <Field label="Billing amount (pre-GST, ₹)">
              <input
                value={form?.billingAmount ?? ""}
                onChange={(e) => setForm((f) => (f ? { ...f, billingAmount: e.target.value } : f))}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              />
            </Field>
            <Field label="Bill from (GST registration)">
              <select
                value={form?.registrationId ?? ""}
                onChange={(e) => {
                  const registrationId = e.target.value;
                  setForm((f) => (f ? { ...f, registrationId } : f));
                  fetchPreview({ registrationId });
                }}
                className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]"
              >
                {registrations.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} — {r.gstin}
                  </option>
                ))}
              </select>
            </Field>

            {error && <p className="text-[12px] text-red-600">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => fetchPreview()}
                disabled={loading}
                className="rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12.5px] font-medium px-3 py-1.5 disabled:opacity-50"
              >
                {loading ? "Refreshing…" : "Refresh preview"}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating || loading}
                className="rounded-md bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[12.5px] font-medium px-3 py-1.5"
              >
                {generating ? "Generating…" : `Generate & ${kind === "proforma" ? "mark sent" : "mark issued"}`}
              </button>
              <button
                onClick={onClose}
                className="rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 text-[12.5px] font-medium px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="bg-slate-100 dark:bg-slate-950 p-3">
            {pdfBase64 ? (
              <iframe
                title="Invoice preview"
                src={`data:application/pdf;base64,${pdfBase64}`}
                className="w-full h-full min-h-[500px] rounded-md border border-slate-200 dark:border-slate-800 bg-white"
              />
            ) : (
              <div className="w-full h-full min-h-[500px] flex items-center justify-center text-[12.5px] text-slate-400">
                {loading ? "Rendering preview…" : "No preview yet"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10.5px] font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
