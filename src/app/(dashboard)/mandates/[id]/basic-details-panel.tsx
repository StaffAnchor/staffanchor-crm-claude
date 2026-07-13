"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, X, Check, Briefcase } from "lucide-react";
import { cityOptions, subDomainsForCategory } from "@/lib/candidate-options";

export type MandateBasicDetails = {
  role_title: string;
  client_name: string;
  category: string | null;
  sub_domains: string[];
  cities: string[];
  budget_min: number | null;
  budget_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
  status: string;
};

const STATUS_OPTIONS = ["draft", "open", "on_hold", "closed", "filled"];
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft (not published)",
  open: "Open",
  on_hold: "On hold",
  closed: "Closed",
  filled: "Filled",
};

export default function BasicDetailsPanel({
  mandateId,
  initial,
}: {
  mandateId: string;
  initial: MandateBasicDetails;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    role_title: initial.role_title,
    client_name: initial.client_name,
    category: initial.category ?? "",
    subDomains: initial.sub_domains ?? [],
    cityPick: "",
    cityOther: "",
    cities: initial.cities ?? [],
    budget_min: initial.budget_min?.toString() ?? "",
    budget_max: initial.budget_max?.toString() ?? "",
    experience_min: initial.experience_min?.toString() ?? "",
    experience_max: initial.experience_max?.toString() ?? "",
    status: initial.status,
  });

  const subDomainOptions = subDomainsForCategory(form.category || null);
  const isMultiSubDomain = form.category === "b2b_sales" || form.category === "b2c_sales";

  function toggleSubDomain(value: string) {
    setForm((f) => ({
      ...f,
      subDomains: f.subDomains.includes(value) ? f.subDomains.filter((s) => s !== value) : [...f.subDomains, value],
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

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    const { error: err } = await supabase
      .from("mandates")
      .update({
        role_title: form.role_title,
        client_name: form.client_name,
        category: form.category || null,
        sub_domains: form.subDomains,
        sub_domain: form.subDomains.join(", ") || null,
        cities: form.cities,
        city: form.cities[0] || null,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: form.budget_max ? Number(form.budget_max) : null,
        experience_min: form.experience_min ? Number(form.experience_min) : null,
        experience_max: form.experience_max ? Number(form.experience_max) : null,
        status: form.status,
      })
      .eq("id", mandateId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSaved(true);
    setEditing(false);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  if (!editing) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Mandate details
          </h2>
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">
          Budget: {initial.budget_min ?? "—"}
          {initial.budget_max ? ` – ${initial.budget_max}` : ""} L · Experience: {initial.experience_min ?? "—"}
          {initial.experience_max ? ` – ${initial.experience_max}` : ""} yrs · Status:{" "}
          {STATUS_LABEL[initial.status] ?? initial.status}
        </p>
        {saved && (
          <p className="flex items-center gap-1 text-[11px] text-emerald-600 mt-2">
            <Check className="w-3 h-3" /> Saved
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm space-y-2.5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Briefcase className="w-3.5 h-3.5 text-slate-400" /> Edit mandate details
        </h2>
        <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <input
        value={form.client_name}
        onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
        placeholder="Client name"
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />
      <input
        value={form.role_title}
        onChange={(e) => setForm((f) => ({ ...f, role_title: e.target.value }))}
        placeholder="Role title"
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

      {form.category && (
        <div>
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Sub-domain{isMultiSubDomain ? " (select all this client would accept)" : ""}
          </p>
          {isMultiSubDomain ? (
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
        </div>
      )}

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
            onChange={(e) => {
              // Adds immediately on selection -- a separate "Add" click
              // after picking from this dropdown was easy to miss (a
              // recruiter picked a city here, hit Save, and the city never
              // actually changed because it was never added to the list).
              addCity(e.target.value);
              setForm((f) => ({ ...f, cityPick: "" }));
            }}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select city to add...</option>
            {cityOptions
              .filter((c) => c !== "Other")
              .map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
          </select>
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

      <select
        value={form.status}
        onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      >
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s] ?? s.replace("_", " ")}
          </option>
        ))}
      </select>

      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      <p className="text-[11px] text-slate-400">
        Changes save immediately to this mandate and are reflected on the public job listing right away.
      </p>
    </div>
  );
}
