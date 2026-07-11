"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateClientForm() {
  const router = useRouter();
  const supabase = createClient();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [hqCity, setHqCity] = useState("");
  const [website, setWebsite] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from("clients")
      .insert({
        name: name.trim(),
        industry: industry.trim() || null,
        hq_city: hqCity.trim() || null,
        website: website.trim() || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    router.push(`/clients/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Client name *</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Retail Pvt Ltd"
          required
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Industry</label>
        <input
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="e.g. FMCG, SaaS, BFSI"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">HQ city</label>
        <input
          value={hqCity}
          onChange={(e) => setHqCity(e.target.value)}
          placeholder="e.g. Mumbai"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Website</label>
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-500"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 transition-colors"
      >
        {saving ? "Creating…" : "+ Add client"}
      </button>
    </form>
  );
}
