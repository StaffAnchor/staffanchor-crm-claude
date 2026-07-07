"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateMandateForm() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    client_name: "",
    role_title: "",
    category: "",
    sub_domain: "",
    city: "",
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
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm({ client_name: "", role_title: "", category: "", sub_domain: "", city: "" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        required
        placeholder="Client name"
        value={form.client_name}
        onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
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
