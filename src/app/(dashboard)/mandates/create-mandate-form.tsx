"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateMandateForm({ existingClients }: { existingClients: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    client_name: "",
    role_title: "",
    category: "",
    sub_domain: "",
    city: "",
    budget_min: "",
    budget_max: "",
    experience_min: "",
    experience_max: "",
    hide_client: false,
    public_client_label: "",
    job_description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const { error } = await supabase.from("mandates").insert({
      client_name: form.client_name,
      role_title: form.role_title,
      category: form.category || null,
      sub_domain: form.sub_domain || null,
      city: form.city || null,
      budget_min: form.budget_min ? Number(form.budget_min) : null,
      budget_max: form.budget_max ? Number(form.budget_max) : null,
      experience_min: form.experience_min ? Number(form.experience_min) : null,
      experience_max: form.experience_max ? Number(form.experience_max) : null,
      show_client_name: !form.hide_client,
      public_client_label: form.hide_client ? form.public_client_label || null : null,
      job_description: form.job_description || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({
      client_name: "",
      role_title: "",
      category: "",
      sub_domain: "",
      city: "",
      budget_min: "",
      budget_max: "",
      experience_min: "",
      experience_max: "",
      hide_client: false,
      public_client_label: "",
      job_description: "",
    });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <input
          required
          list="existing-clients"
          placeholder="Client name"
          value={form.client_name}
          onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <datalist id="existing-clients">
          {existingClients.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <input
        required
        placeholder="Role title"
        value={form.role_title}
        onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <select
        value={form.category}
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="">Category...</option>
        <option value="b2b_sales">B2B Sales</option>
        <option value="b2c_sales">B2C Sales</option>
        <option value="non_sales">Non-Sales</option>
      </select>
      <input
        placeholder="Sub-domain"
        value={form.sub_domain}
        onChange={(e) => setForm((f) => ({ ...f, sub_domain: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        placeholder="City"
        value={form.city}
        onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Budget min (L)"
          value={form.budget_min}
          onChange={(e) => setForm((f) => ({ ...f, budget_min: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Budget max (L)"
          value={form.budget_max}
          onChange={(e) => setForm((f) => ({ ...f, budget_max: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Experience min (yrs)"
          value={form.experience_min}
          onChange={(e) => setForm((f) => ({ ...f, experience_min: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Experience max (yrs)"
          value={form.experience_max}
          onChange={(e) => setForm((f) => ({ ...f, experience_max: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <textarea
        placeholder="Job description (shown to candidates on the public listing)"
        value={form.job_description}
        onChange={(e) => setForm((f) => ({ ...f, job_description: e.target.value }))}
        rows={5}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
      />

      <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
        <label className="flex items-start gap-2 text-[12px] text-slate-700">
          <input
            type="checkbox"
            checked={form.hide_client}
            onChange={(e) => setForm((f) => ({ ...f, hide_client: e.target.checked }))}
            className="mt-0.5"
          />
          Hide client name on the public job listing (jobs.staffanchor.com)
        </label>
        {form.hide_client && (
          <input
            placeholder='e.g. "A leading Internet company"'
            value={form.public_client_label}
            onChange={(e) => setForm((f) => ({ ...f, public_client_label: e.target.value }))}
            className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        )}
        <p className="text-[11px] text-slate-400 mt-1.5">
          {form.hide_client
            ? "Candidates will see this text instead of the real client name."
            : "The real client name will be visible on the public job listing."}
        </p>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Creating..." : "Create mandate"}
      </button>
    </form>
  );
}
