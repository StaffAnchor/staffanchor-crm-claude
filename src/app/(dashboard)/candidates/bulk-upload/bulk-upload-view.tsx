"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, X, Loader2, AlertTriangle, Check, ArrowRight, Link2 } from "lucide-react";
import { profileTypeOptions, languageOptions, level1OptionsForProfileType } from "@/lib/candidate-options";
import { createClient } from "@/lib/supabase/client";

const SOURCE_CHANNEL_OPTIONS = ["Naukri", "LinkedIn", "IIMJobs", "Monster", "Referral", "Other"];
const MAX_FILES = 10;

type MandateOption = { id: string; role_title: string; client_name: string };

type Row = {
  fileName: string;
  ok: boolean;
  error?: string;
  resumeFileUrl?: string;
  duplicate?: { candidateId: string; fullName: string } | null;
  // Editable fields, seeded from the AI extraction but the recruiter can
  // fix anything the model got wrong (or fill in what it couldn't find)
  // before anything is actually saved.
  full_name: string;
  email: string;
  phone: string;
  current_location: string;
  current_employer: string;
  current_job_title: string;
  total_experience_years: string;
  languages_known: string[];
  // Optional: a batch might be sourced for one specific mandate, or just
  // general pipeline-building with no mandate in mind -- so this defaults
  // to "" (unlinked), not required to create the candidate.
  mandate_id: string;
  included: boolean;
  createState: "idle" | "saving" | "saved" | "error";
  createError?: string;
  createdCandidateId?: string;
  linkError?: string;
};

export default function BulkUploadView({ mandates }: { mandates: MandateOption[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [profileType, setProfileType] = useState("");
  // Optional, batch-level Function/Specialization -- previously bulk-uploaded
  // candidates got a Profile Type (B2B/B2C/Non-Sales) but no sub_domain at
  // all, since the AI extraction never inferred it and there was no field to
  // set it manually. Same "applies to the whole batch" convention as Profile
  // Type/Source above (a bulk upload is usually all for one role), and
  // resets whenever Profile Type changes since the option list depends on it.
  const [subDomain, setSubDomain] = useState("");
  const [subDomainOther, setSubDomainOther] = useState("");
  const subDomainOptions = level1OptionsForProfileType(profileType || null);
  const [sourceChannel, setSourceChannel] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkMandateId, setBulkMandateId] = useState("");

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
    if (files.length === 0 || !profileType || !sourceChannel) return;
    setExtracting(true);
    setExtractError(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const res = await fetch("/api/candidates/bulk-extract", { method: "POST", body: formData });
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
          languages_known: (extracted.languages_known as string[]) ?? [],
          mandate_id: "",
          included: (r.ok as boolean) && !r.duplicate,
          createState: "idle",
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

  async function handleCreateAll() {
    if (!rows) return;
    setCreating(true);
    const toCreate = rows.filter((r) => r.included && r.createState !== "saved");
    for (const row of toCreate) {
      updateRow(row.fileName, { createState: "saving" });
      try {
        const res = await fetch("/api/candidate-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: {
              full_name: row.full_name || "Unknown",
              email: row.email,
              phone: row.phone || null,
              category: profileType,
              sub_domain: subDomain ? (subDomain === "Other" ? subDomainOther || null : subDomain) : null,
              current_location: row.current_location || null,
              current_employer: row.current_employer || null,
              current_job_title: row.current_job_title || null,
              total_experience_years: row.total_experience_years ? Number(row.total_experience_years) : null,
              resume_file_url: row.resumeFileUrl ?? null,
              segment_data: row.languages_known.length ? { languages_known: row.languages_known } : {},
              status: "awaiting_input",
              created_by: "bulk_resume_upload",
              source_channel: sourceChannel,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          updateRow(row.fileName, { createState: "error", createError: data?.error ?? "Could not save this candidate." });
          continue;
        }
        updateRow(row.fileName, { createState: "saved", createdCandidateId: data.candidateId });

        // Optional mandate link -- same candidate_mandate_links insert the
        // "Find matches" panel uses when a recruiter adds someone to a
        // pipeline manually. Non-fatal if it fails: the candidate is still
        // created either way, just flagged so the recruiter can link it
        // themselves from the candidate or mandate page.
        if (row.mandate_id) {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          const { error: linkErr } = await supabase.from("candidate_mandate_links").insert({
            candidate_id: data.candidateId,
            mandate_id: row.mandate_id,
            added_by: user?.id ?? null,
          });
          if (linkErr) updateRow(row.fileName, { linkError: "Created, but couldn't link to the mandate." });
        }
      } catch {
        updateRow(row.fileName, { createState: "error", createError: "Network error." });
      }
    }
    setCreating(false);
  }

  const savedCount = rows?.filter((r) => r.createState === "saved").length ?? 0;
  const includedCount = rows?.filter((r) => r.included).length ?? 0;
  const allDone = rows !== null && rows.filter((r) => r.included).every((r) => r.createState === "saved");

  return (
    <div className="space-y-4">
      {!rows && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-ros-lg p-4 shadow-ros-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Current profile type <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-400 mb-1.5">
                Applies to every resume in this batch -- since a bulk upload usually pertains to one mandate.
              </p>
              <select
                value={profileType}
                onChange={(e) => {
                  setProfileType(e.target.value);
                  setSubDomain("");
                  setSubDomainOther("");
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12.5px]"
              >
                <option value="">Select...</option>
                {profileTypeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {subDomainOptions.length > 0 && (
              <div>
                <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Function / Specialization <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <p className="text-[11px] text-slate-400 mb-1.5">Also applies to the whole batch.</p>
                <select
                  value={subDomain}
                  onChange={(e) => {
                    setSubDomain(e.target.value);
                    if (e.target.value !== "Other") setSubDomainOther("");
                  }}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12.5px]"
                >
                  <option value="">Not sure -- leave blank</option>
                  {subDomainOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                {subDomain === "Other" && (
                  <input
                    value={subDomainOther}
                    onChange={(e) => setSubDomainOther(e.target.value)}
                    placeholder="Please specify"
                    className="w-full mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12.5px]"
                  />
                )}
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                Source <span className="text-red-500">*</span>
              </label>
              <p className="text-[11px] text-slate-400 mb-1.5">Where these CVs were downloaded from.</p>
              <select
                value={sourceChannel}
                onChange={(e) => setSourceChannel(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[12.5px]"
              >
                <option value="">Select...</option>
                {SOURCE_CHANNEL_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 px-4 py-8 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
            <UploadCloud className="w-6 h-6 text-slate-400" />
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-300">
              Click to choose resumes, or drag them here
            </span>
            <span className="text-[11px] text-slate-400">PDF or DOCX -- up to {MAX_FILES} files</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx"
              className="hidden"
              onChange={handleFilePick}
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-1.5">
              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5"
                >
                  <span className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-slate-300 truncate">
                    <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    {f.name}
                  </span>
                  <button type="button" onClick={() => removeFile(f.name)} className="text-slate-400 hover:text-slate-700">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                {files.length} of {MAX_FILES} selected
              </p>
            </div>
          )}

          {extractError && (
            <p className="flex items-center gap-1.5 text-[12.5px] text-rose-600">
              <AlertTriangle className="w-3.5 h-3.5" /> {extractError}
            </p>
          )}

          <button
            type="button"
            onClick={handleExtract}
            disabled={files.length === 0 || !profileType || !sourceChannel || extracting}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium px-3.5 py-2 transition-all duration-200 ease-ros"
          >
            {extracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            {extracting ? `Reading ${files.length} resume${files.length === 1 ? "" : "s"}...` : "Extract & review"}
          </button>
        </div>
      )}

      {rows && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
              {rows.length} resume{rows.length === 1 ? "" : "s"} processed -- review and fix anything below before saving.
            </p>
            <button
              type="button"
              onClick={() => {
                setRows(null);
                setFiles([]);
              }}
              className="text-[12px] font-medium text-slate-500 hover:text-slate-800"
            >
              Start over
            </button>
          </div>

          {mandates.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 px-3 py-2">
              <Link2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[12px] text-slate-500 dark:text-slate-400">
                Link all uploaded candidates to a mandate (optional):
              </span>
              <select
                value={bulkMandateId}
                onChange={(e) => setBulkMandateId(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[12px] max-w-[16rem]"
              >
                <option value="">No mandate -- general pipeline</option>
                {mandates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.role_title} — {m.client_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setRows((prev) => (prev ? prev.map((r) => ({ ...r, mandate_id: bulkMandateId })) : prev))}
                className="text-[12px] font-medium text-blue-600 hover:text-blue-700"
              >
                Apply to all
              </button>
            </div>
          )}

          {rows.map((row) => (
            <div
              key={row.fileName}
              className={`bg-white dark:bg-slate-900 border rounded-ros-lg p-3.5 shadow-ros-sm ${
                row.duplicate ? "border-amber-200 bg-amber-50/30" : "border-slate-100 dark:border-slate-800"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {row.createState !== "saved" && (
                    <input
                      type="checkbox"
                      checked={row.included}
                      onChange={(e) => updateRow(row.fileName, { included: e.target.checked })}
                      disabled={!row.ok}
                    />
                  )}
                  <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300 truncate">
                    {row.fileName}
                  </span>
                </div>
                {row.createState === "saved" && row.createdCandidateId && (
                  <Link
                    href={`/candidates/${row.createdCandidateId}`}
                    className="flex items-center gap-1 text-[12px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1 shrink-0"
                  >
                    <Check className="w-3 h-3" /> {row.mandate_id && !row.linkError ? "Created & linked" : "Created"}
                  </Link>
                )}
              </div>

              {!row.ok && (
                <p className="flex items-center gap-1.5 text-[12px] text-rose-600 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> {row.error ?? "Couldn't process this file."}
                </p>
              )}

              {row.duplicate && (
                <p className="flex items-center gap-1.5 text-[12px] text-amber-700 mb-2.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Looks like this email already exists --{" "}
                  <Link href={`/candidates/${row.duplicate.candidateId}`} className="underline font-medium">
                    {row.duplicate.fullName}
                  </Link>
                  . Unchecked by default so a duplicate isn&apos;t created; open their profile instead if you want to
                  attach this resume there.
                </p>
              )}

              {row.ok && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Full name" value={row.full_name} onChange={(v) => updateRow(row.fileName, { full_name: v })} />
                  <Field label="Email" value={row.email} onChange={(v) => updateRow(row.fileName, { email: v })} />
                  <Field label="Mobile" value={row.phone} onChange={(v) => updateRow(row.fileName, { phone: v })} />
                  <Field
                    label="Current city"
                    value={row.current_location}
                    onChange={(v) => updateRow(row.fileName, { current_location: v })}
                  />
                  <Field
                    label="Current employer"
                    value={row.current_employer}
                    onChange={(v) => updateRow(row.fileName, { current_employer: v })}
                  />
                  <Field
                    label="Current title"
                    value={row.current_job_title}
                    onChange={(v) => updateRow(row.fileName, { current_job_title: v })}
                  />
                  <Field
                    label="Experience (years)"
                    value={row.total_experience_years}
                    onChange={(v) => updateRow(row.fileName, { total_experience_years: v })}
                  />
                  {mandates.length > 0 && (
                    <div>
                      <label className="block text-[10.5px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                        Mandate (optional)
                      </label>
                      <select
                        value={row.mandate_id}
                        onChange={(e) => updateRow(row.fileName, { mandate_id: e.target.value })}
                        disabled={row.createState === "saved"}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[12.5px] disabled:opacity-60"
                      >
                        <option value="">Not linked</option>
                        {mandates.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.role_title} — {m.client_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10.5px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">
                      Languages known
                    </label>
                    <select
                      multiple
                      value={row.languages_known}
                      onChange={(e) =>
                        updateRow(row.fileName, {
                          languages_known: Array.from(e.target.selectedOptions).map((o) => o.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[12px] h-[62px]"
                    >
                      {languageOptions.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {row.createState === "error" && (
                <p className="mt-2 text-[12px] text-rose-600">{row.createError}</p>
              )}
              {row.linkError && <p className="mt-2 text-[12px] text-amber-600">{row.linkError}</p>}
            </div>
          ))}

          {!allDone ? (
            <button
              type="button"
              onClick={handleCreateAll}
              disabled={creating || includedCount === 0}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[13px] font-medium px-3.5 py-2 transition-all duration-200 ease-ros"
            >
              {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {creating
                ? `Creating candidates (${savedCount}/${includedCount})...`
                : `Create ${includedCount} candidate${includedCount === 1 ? "" : "s"} & email them to complete their profile`}
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
              <p className="text-[13px] font-medium text-emerald-800">
                {savedCount} candidate{savedCount === 1 ? "" : "s"} created and emailed to complete their profile.
              </p>
              <button
                type="button"
                onClick={() => router.push("/candidates?origin=bulk_resume_upload")}
                className="text-[12.5px] font-medium text-emerald-700 underline"
              >
                View them
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10.5px] font-medium text-slate-500 dark:text-slate-400 mb-0.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[12.5px]"
      />
    </div>
  );
}
