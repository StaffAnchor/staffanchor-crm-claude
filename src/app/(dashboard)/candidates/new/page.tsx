"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NewCandidatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    category: "",
    sub_domain: "",
    recruiter_seed_note: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        category: form.category || null,
        sub_domain: form.sub_domain || null,
        recruiter_seed_note: form.recruiter_seed_note || null,
        status: "awaiting_input",
        created_by: "recruiter_created",
        created_by_user: user?.id,
        source: "referral",
      })
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/candidates/${data.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-900 mb-1">Create candidate</h1>
      <p className="text-sm text-slate-500 mb-6">
        Seed only what you know. Deep fields (comp, quota, deal size) come from the
        candidate once you send them a completion invite.
      </p>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Full name *</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Best-guess category</label>
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            <option value="b2b_sales">B2B Sales</option>
            <option value="b2c_sales">B2C Sales</option>
            <option value="non_sales">Non-Sales</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Best-guess sub-domain</label>
          <input
            value={form.sub_domain}
            onChange={(e) => setForm((f) => ({ ...f, sub_domain: e.target.value }))}
            placeholder="e.g. SaaS Sales"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Note</label>
          <textarea
            value={form.recruiter_seed_note}
            onChange={(e) => setForm((f) => ({ ...f, recruiter_seed_note: e.target.value }))}
            placeholder="e.g. Met at SaaS founders event, ex-Freshworks AE, strong"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create candidate"}
        </button>
      </form>
    </div>
  );
}
