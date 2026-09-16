"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlyVendorError } from "@/lib/friendly-error";
import type { VendorCandidateRow } from "../vendor-candidates-table";

export default function VendorCandidateEditForm({ candidate }: { candidate: VendorCandidateRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    full_name: candidate.full_name ?? "",
    phone: candidate.phone ?? "",
    current_location: candidate.current_location ?? "",
    total_experience_years: candidate.total_experience_years?.toString() ?? "",
    current_employer: candidate.current_employer ?? "",
    current_job_title: candidate.current_job_title ?? "",
    linkedin_url: candidate.linkedin_url ?? "",
  });

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.full_name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc("vendor_update_candidate", {
      p_candidate_id: candidate.candidate_id,
      p_full_name: form.full_name.trim(),
      p_phone: form.phone.trim() || null,
      p_current_location: form.current_location.trim() || null,
      p_total_experience_years: form.total_experience_years ? Number(form.total_experience_years) : null,
      p_current_employer: form.current_employer.trim() || null,
      p_current_job_title: form.current_job_title.trim() || null,
      p_linkedin_url: form.linkedin_url.trim() || null,
    });
    setSaving(false);
    if (rpcError) {
      setError(friendlyVendorError(rpcError.message, "vendor-update-candidate"));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
      {error && (
        <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{error}</div>
      )}
      <label className="text-[12px] text-slate-500">
        Full name *
        <input
          required
          value={form.full_name}
          onChange={(e) => update("full_name", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500">
        Phone
        <input
          value={form.phone}
          onChange={(e) => update("phone", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500">
        Current location
        <input
          value={form.current_location}
          onChange={(e) => update("current_location", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500">
        Total experience (years)
        <input
          type="number"
          step="0.5"
          min="0"
          value={form.total_experience_years}
          onChange={(e) => update("total_experience_years", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500">
        Current employer
        <input
          value={form.current_employer}
          onChange={(e) => update("current_employer", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500">
        Current job title
        <input
          value={form.current_job_title}
          onChange={(e) => update("current_job_title", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>
      <label className="text-[12px] text-slate-500 sm:col-span-2">
        LinkedIn URL
        <input
          value={form.linkedin_url}
          onChange={(e) => update("linkedin_url", e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
      </label>

      <div className="sm:col-span-2 flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[13px] font-medium px-4 py-2 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
        {saved && <span className="text-[12px] text-teal-700">Saved.</span>}
      </div>
    </form>
  );
}
