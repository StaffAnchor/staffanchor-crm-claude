"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, X, Loader2, AlertTriangle, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { friendlyVendorError } from "@/lib/friendly-error";

const MAX_FILES = 10;

type Row = {
  fileName: string;
  ok: boolean;
  error?: string;
  resumeFileUrl?: string;
  duplicate?: { candidateId: string; fullName: string } | null;
  full_name: string;
  email: string;
  phone: string;
  current_location: string;
  current_employer: string;
  current_job_title: string;
  total_experience_years: string;
  included: boolean;
  submitState: "idle" | "saving" | "saved" | "error";
  submitError?: string;
};

export default function VendorBulkUploadView({ mandates }: { mandates: { id: string; label: string }[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mandateId, setMandateId] = useState(mandates[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    const combined = [...files, ...picked].slice(0, MAX_FILES);
    setFiles(combined);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(name: string) {
    setFiles((prev) => prev.filter((f) => f.name !== name));
  }

  async function handleExtract() {
    if (files.length === 0 || !mandateId) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const formData = new FormData();
      formData.append("mandateId", mandateId);
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/vendor/bulk-extract", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setExtractError(data?.error ?? "Something went wrong reading these resumes.");
        return;
      }
      const newRows: Row[] = (data.results as Array<Record<string, unknown>>).map((r) => {
        const extracted = (r.extracted as Record<string, unknown>) ?? {};
        return {
          fileName: r.fileName as string,
          ok: r.ok as boolean,
          error: r.error as string | undefined,
          resumeFileUrl: r.resumeFileUrl as string | undefined,
          duplicate: r.duplicate as Row["duplicate"],
          full_name: (extracted.full_name as string) ?? "",
          email: (extracted.email as string) ?? "",
          phone: (extracted.phone as string) ?? "",
          current_location: (extracted.current_location as string) ?? "",
          current_employer: (extracted.current_employer as string) ?? "",
          current_job_title: (extracted.current_job_title as string) ?? "",
          total_experience_years:
            extracted.total_experience_years !== null && extracted.total_experience_years !== undefined
              ? String(extracted.total_experience_years)
              : "",
          included: (r.ok as boolean) && !r.duplicate,
          submitState: "idle",
        };
      });
      setRows(newRows);
    } catch {
      setExtractError("Network error -- please try again.");
    } finally {
      setExtracting(false);
    }
  }

  function updateRow(fileName: string, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r) => (r.fileName === fileName ? { ...r, ...patch } : r)) : prev));
  }

  async function handleSubmitAll() {
    if (!rows) return;
    setSubmitting(true);
    const toSubmit = rows.filter((r) => r.included && r.submitState !== "saved");
    for (const row of toSubmit) {
      if (!row.full_name.trim() || !row.email.trim()) {
        updateRow(row.fileName, { submitState: "error", submitError: "Name and email are required." });
        continue;
      }
      updateRow(row.fileName, { submitState: "saving" });
      const { error } = await supabase.rpc("vendor_submit_candidate", {
        p_mandate_id: mandateId,
        p_full_name: row.full_name.trim(),
        p_email: row.email.trim(),
        p_phone: row.phone.trim() || null,
        p_resume_file_url: row.resumeFileUrl ?? null,
        p_current_location: row.current_location.trim() || null,
        p_total_experience_years: row.total_experience_years ? Number(row.total_experience_years) : null,
        p_current_employer: row.current_employer.trim() || null,
        p_current_job_title: row.current_job_title.trim() || null,
        p_note: null,
      });
      if (error) {
        updateRow(row.fileName, { submitState: "error", submitError: friendlyVendorError(error.message, "vendor-bulk-submit") });
      } else {
        updateRow(row.fileName, { submitState: "saved" });
      }
    }
    setSubmitting(false);
    router.refresh();
  }

  const includedCount = rows?.filter((r) => r.included).length ?? 0;
  const savedCount = rows?.filter((r) => r.submitState === "saved").length ?? 0;
  const allDone = rows !== null && rows.filter((r) => r.included).every((r) => r.submitState === "saved");

  return (
    <div className="space-y-4">
      {!rows && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium text-slate-600 mb-1">Which mandate is this batch for? *</span>
            <select
              value={mandateId}
              onChange={(e) => setMandateId(e.target.value)}
              className="w-full sm:w-96 rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
            >
              {mandates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-8 text-center cursor-pointer hover:bg-slate-50">
              <UploadCloud className="w-6 h-6 text-slate-400" />
              <span className="text-[13px] text-slate-600">Click to choose up to {MAX_FILES} resumes (PDF, DOC, DOCX)</span>
              <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" multiple className="hidden" onChange={handleFilePick} />
            </label>
          </div>

          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div key={f.name} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-1.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-slate-600 truncate">
                    <FileText className="w-3.5 h-3.5 shrink-0" /> {f.name}
                  </span>
                  <button onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-slate-600 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {extractError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{extractError}</div>
          )}

          <button
            onClick={handleExtract}
            disabled={files.length === 0 || !mandateId || extracting}
            className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-4 py-2.5 disabled:opacity-50 inline-flex items-center gap-2"
          >
            {extracting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {extracting ? "Reading resumes..." : `Read ${files.length || ""} resume${files.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {rows && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-slate-600">
              {savedCount}/{includedCount} saved
            </p>
            {!allDone && (
              <button
                onClick={handleSubmitAll}
                disabled={submitting || includedCount === 0}
                className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-4 py-2 disabled:opacity-50"
              >
                {submitting ? "Submitting..." : `Submit ${includedCount} candidate${includedCount === 1 ? "" : "s"}`}
              </button>
            )}
            {allDone && (
              <Link href="/vendor/candidates" className="text-[13px] font-medium text-teal-600 hover:text-teal-700">
                Done -- view My Candidates
              </Link>
            )}
          </div>

          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.fileName}
                className={`rounded-2xl border p-4 ${
                  row.submitState === "saved"
                    ? "border-emerald-200 bg-emerald-50/40"
                    : row.duplicate
                    ? "border-amber-200 bg-amber-50/40"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <label className="flex items-center gap-2 text-[12px] text-slate-500">
                    <input
                      type="checkbox"
                      checked={row.included}
                      disabled={row.submitState === "saved"}
                      onChange={(e) => updateRow(row.fileName, { included: e.target.checked })}
                    />
                    {row.fileName}
                  </label>
                  {row.submitState === "saved" && (
                    <span className="inline-flex items-center gap-1 text-[12px] text-emerald-700">
                      <Check className="w-3.5 h-3.5" /> Saved
                    </span>
                  )}
                </div>

                {!row.ok && (
                  <p className="text-[12px] text-amber-700 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {row.error}
                  </p>
                )}
                {row.duplicate && (
                  <p className="text-[12px] text-amber-700 mb-2">
                    Looks like you may have already submitted {row.duplicate.fullName} with this email.
                  </p>
                )}
                {row.submitError && <p className="text-[12px] text-red-600 mb-2">{row.submitError}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Full name *"
                    value={row.full_name}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { full_name: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                  <input
                    placeholder="Email *"
                    value={row.email}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { email: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                  <input
                    placeholder="Phone"
                    value={row.phone}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { phone: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                  <input
                    placeholder="Location"
                    value={row.current_location}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { current_location: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                  <input
                    placeholder="Current employer"
                    value={row.current_employer}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { current_employer: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                  <input
                    type="number"
                    step="0.5"
                    placeholder="Exp (years)"
                    value={row.total_experience_years}
                    disabled={row.submitState === "saved"}
                    onChange={(e) => updateRow(row.fileName, { total_experience_years: e.target.value })}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] disabled:bg-slate-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
