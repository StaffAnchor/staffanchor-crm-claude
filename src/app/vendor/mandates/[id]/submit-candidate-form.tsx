"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { UploadCloud, X } from "lucide-react";

export default function SubmitCandidateForm({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    current_location: "",
    total_experience_years: "",
    current_employer: "",
    current_job_title: "",
    note: "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    setSaving(true);

    let resumeFileUrl: string | null = null;
    if (resumeFile) {
      const path = `${crypto.randomUUID()}-${resumeFile.name}`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, resumeFile, {
        contentType: resumeFile.type || undefined,
      });
      if (uploadError) {
        setSaving(false);
        setError(`Resume upload failed: ${uploadError.message}`);
        return;
      }
      resumeFileUrl = path;
    }

    const { error: rpcError } = await supabase.rpc("vendor_submit_candidate", {
      p_mandate_id: mandateId,
      p_full_name: form.full_name.trim(),
      p_email: form.email.trim(),
      p_phone: form.phone.trim() || null,
      p_resume_file_url: resumeFileUrl,
      p_current_location: form.current_location.trim() || null,
      p_total_experience_years: form.total_experience_years ? Number(form.total_experience_years) : null,
      p_current_employer: form.current_employer.trim() || null,
      p_current_job_title: form.current_job_title.trim() || null,
      p_note: form.note.trim() || null,
    });

    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    setSuccess(true);
    setForm({
      full_name: "",
      email: "",
      phone: "",
      current_location: "",
      total_experience_years: "",
      current_employer: "",
      current_job_title: "",
      note: "",
    });
    setResumeFile(null);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setOpen(true);
          setSuccess(false);
        }}
        className="w-full sm:w-auto rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-4 py-2.5"
      >
        + Submit a candidate
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[14px] font-semibold text-slate-900">Submit a candidate</h3>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      {success && (
        <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-[12px] text-teal-700">
          Candidate submitted. It&apos;ll show up in your submissions list right away.
        </div>
      )}
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          required
          placeholder="Full name *"
          value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          required
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => update("email", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          placeholder="Current location"
          value={form.current_location}
          onChange={(e) => update("current_location", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          type="number"
          step="0.5"
          min="0"
          placeholder="Total experience (years)"
          value={form.total_experience_years}
          onChange={(e) => update("total_experience_years", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          placeholder="Current employer"
          value={form.current_employer}
          onChange={(e) => update("current_employer", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <input
          placeholder="Current job title"
          value={form.current_job_title}
          onChange={(e) => update("current_job_title", e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] sm:col-span-2"
        />
        <textarea
          placeholder="Note for the recruiter (optional)"
          value={form.note}
          onChange={(e) => update("note", e.target.value)}
          rows={2}
          className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] sm:col-span-2"
        />

        <label className="sm:col-span-2 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-[13px] text-slate-500 cursor-pointer hover:bg-slate-50">
          <UploadCloud className="w-4 h-4 shrink-0" />
          <span className="truncate">{resumeFile ? resumeFile.name : "Click to upload their resume (PDF, DOC, DOCX)"}</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <div className="sm:col-span-2 flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 sm:flex-none rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-4 py-2 disabled:opacity-60"
          >
            {saving ? "Submitting..." : "Submit candidate"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[13px] text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
