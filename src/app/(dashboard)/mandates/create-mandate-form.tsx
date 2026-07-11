"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, X } from "lucide-react";
import { cityOptions, subDomainsForCategory } from "@/lib/candidate-options";

export default function CreateMandateForm({ existingClients }: { existingClients: string[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    client_name: "",
    role_title: "",
    category: "",
    subDomains: [] as string[],
    subDomainKeywords: "",
    cities: [] as string[],
    cityPick: "",
    cityOther: "",
    budget_min: "",
    budget_max: "",
    experience_min: "",
    experience_max: "",
    hide_client: false,
    public_client_label: "",
    jd_raw_notes: "",
    jd_overview: "",
    jd_responsibilities: "",
    jd_candidate_profile: "",
    jd_compensation_benefits: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generatingJd, setGeneratingJd] = useState(false);
  const [jdError, setJdError] = useState("");

  const subDomainOptions = subDomainsForCategory(form.category || null);
  const isMultiSubDomain = form.category === "b2b_sales" || form.category === "b2c_sales";

  function toggleSubDomain(value: string) {
    setForm((f) => ({
      ...f,
      subDomains: f.subDomains.includes(value)
        ? f.subDomains.filter((s) => s !== value)
        : [...f.subDomains, value],
    }));
  }

  function addCity(value: string) {
    const v = value.trim();
    if (!v || v === "Other") return;
    setForm((f) => (f.cities.includes(v) ? f : { ...f, cities: [...f.cities, v] }));
  }

  function removeCity(value: string) {
    setForm((f) => ({ ...f, cities: f.cities.filter((c) => c !== value) }));
  }

  function resolvedSubDomains(): string[] {
    const keywords = form.subDomainKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    return Array.from(new Set([...form.subDomains, ...keywords]));
  }

  async function handleGenerateJd() {
    setJdError("");
    setGeneratingJd(true);
    try {
      const res = await fetch("/api/generate-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role_title: form.role_title,
          category: form.category,
          sub_domains: resolvedSubDomains(),
          cities: form.cities,
          experience_min: form.experience_min,
          experience_max: form.experience_max,
          budget_min: form.budget_min,
          budget_max: form.budget_max,
          raw_notes: form.jd_raw_notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI generation failed.");
      setForm((f) => ({
        ...f,
        jd_overview: data.overview ?? f.jd_overview,
        jd_responsibilities: (data.responsibilities ?? []).join("\n"),
        jd_candidate_profile: (data.candidate_profile ?? []).join("\n"),
        jd_compensation_benefits: (data.compensation_benefits ?? []).join("\n"),
      }));
    } catch (e) {
      setJdError(e instanceof Error ? e.message : "AI generation failed.");
    } finally {
      setGeneratingJd(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const subDomains = resolvedSubDomains();
    const { data, error } = await supabase
      .from("mandates")
      .insert({
        client_name: form.client_name,
        role_title: form.role_title,
        category: form.category || null,
        sub_domains: subDomains,
        sub_domain: subDomains.join(", ") || null,
        cities: form.cities,
        city: form.cities[0] || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        experience_min: form.experience_min ? Number(form.experience_min) : null,
        experience_max: form.experience_max ? Number(form.experience_max) : null,
        show_client_name: !form.hide_client,
        public_client_label: form.hide_client ? form.public_client_label || null : null,
        jd_overview: form.jd_overview || null,
        jd_responsibilities: form.jd_responsibilities || null,
        jd_candidate_profile: form.jd_candidate_profile || null,
        jd_compensation_benefits: form.jd_compensation_benefits || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }

    // Fire-and-forget: kick off candidate matching against the existing
    // pool right away so suggestions are already sitting there by the time
    // a recruiter opens this mandate, instead of requiring them to remember
    // to click "Find matches" first.
    if (data?.id) {
      fetch("/api/mandate-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId: data.id }),
      }).catch(() => {
        // Best-effort; recruiter can still click "Find matches" manually.
      });
    }
    setForm({
      client_name: "",
      role_title: "",
      category: "",
      subDomains: [],
      subDomainKeywords: "",
      cities: [],
      cityPick: "",
      cityOther: "",
      budget_min: "",
      budget_max: "",
      experience_min: "",
      experience_max: "",
      hide_client: false,
      public_client_label: "",
      jd_raw_notes: "",
      jd_overview: "",
      jd_responsibilities: "",
      jd_candidate_profile: "",
      jd_compensation_benefits: "",
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
        onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subDomains: [] }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        <option value="">Function / Domain...</option>
        <option value="b2b_sales">B2B Sales</option>
        <option value="b2c_sales">B2C Sales</option>
        <option value="non_sales">Non-Sales</option>
      </select>

      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
          Sub-domain{isMultiSubDomain ? " (select all this client would accept)" : ""}
        </p>
        {!form.category ? (
          <p className="text-[12px] text-slate-400 rounded-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
            Pick a Function / Domain above first.
          </p>
        ) : isMultiSubDomain ? (
          <div className="grid gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            {subDomainOptions.map((o) => (
              <label key={o} className="flex items-center gap-2 text-[13px] text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={form.subDomains.includes(o)} onChange={() => toggleSubDomain(o)} />
                {o}
              </label>
            ))}
          </div>
        ) : (
          <select
            value={form.subDomains[0] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, subDomains: e.target.value ? [e.target.value] : [] }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {subDomainOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        <input
          placeholder="Additional keywords (comma-separated, optional)"
          value={form.subDomainKeywords}
          onChange={(e) => setForm((f) => ({ ...f, subDomainKeywords: e.target.value }))}
          className="w-full mt-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Location(s)</p>
        {form.cities.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {form.cities.map((c) => (
              <span
                key={c}
                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[12px] font-medium px-2.5 py-1"
              >
                {c}
                <button type="button" onClick={() => removeCity(c)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <select
            value={form.cityPick}
            onChange={(e) => setForm((f) => ({ ...f, cityPick: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select city...</option>
            {cityOptions
              .filter((c) => c !== "Other")
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
          <button
            type="button"
            onClick={() => {
              addCity(form.cityPick);
              setForm((f) => ({ ...f, cityPick: "" }));
            }}
            className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[12px] font-medium px-3"
          >
            Add
          </button>
        </div>
        <div className="flex gap-2 mt-1.5">
          <input
            placeholder="Other location (manual entry)"
            value={form.cityOther}
            onChange={(e) => setForm((f) => ({ ...f, cityOther: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              addCity(form.cityOther);
              setForm((f) => ({ ...f, cityOther: "" }));
            }}
            className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-[12px] font-medium px-3"
          >
            Add
          </button>
        </div>
      </div>

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

      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Job description (shown to candidates on the public listing)</p>

        <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50/50 p-3 mb-2">
          <p className="text-[11px] font-medium text-blue-700 mb-1.5">Paste rough notes and let AI structure it</p>
          <textarea
            placeholder="Paste a rough JD, bullet notes, or a client email -- AI will turn it into a clean Overview / Key Responsibilities / Candidate Profile / Compensation & Benefits format below."
            value={form.jd_raw_notes}
            onChange={(e) => setForm((f) => ({ ...f, jd_raw_notes: e.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y bg-white dark:bg-slate-900"
          />
          <button
            type="button"
            onClick={handleGenerateJd}
            disabled={generatingJd || !form.jd_raw_notes.trim()}
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" /> {generatingJd ? "Generating..." : "Generate with AI"}
          </button>
          {jdError && <p className="text-[11px] text-red-600 mt-1.5">{jdError}</p>}
        </div>

        <div className="space-y-2">
          <textarea
            placeholder="Overview (1-2 sentence intro to the role/company)"
            value={form.jd_overview}
            onChange={(e) => setForm((f) => ({ ...f, jd_overview: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
          />
          <textarea
            placeholder={"Key Responsibilities (one per line)"}
            value={form.jd_responsibilities}
            onChange={(e) => setForm((f) => ({ ...f, jd_responsibilities: e.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
          />
          <textarea
            placeholder={"Candidate Profile (one per line)"}
            value={form.jd_candidate_profile}
            onChange={(e) => setForm((f) => ({ ...f, jd_candidate_profile: e.target.value }))}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
          />
          <textarea
            placeholder={"Compensation & Benefits (one per line)"}
            value={form.jd_compensation_benefits}
            onChange={(e) => setForm((f) => ({ ...f, jd_compensation_benefits: e.target.value }))}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/50">
        <label className="flex items-start gap-2 text-[12px] text-slate-700 dark:text-slate-300">
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
