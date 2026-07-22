"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Sparkles, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  cityOptions,
  subDomainsForCategory,
  hiringReasonOptions,
  teamHandlingOptions,
  teamSizeOptions,
  workModeOptions,
  workingDaysOptions,
  shiftTimingOptions,
  salesCycleOptions,
  currencyOptions,
  dealSizeBandsFor,
  b2cCustomerTypeOptions,
  clientProfileOptions,
  type CurrencyValue,
} from "@/lib/candidate-options";
import { useMandateOptionSets } from "@/lib/use-mandate-option-sets";
import MultiSelectChips from "@/components/ui/multi-select-chips";
import WeekOffPicker, { emptyWeekOffValue, type WeekOffValue } from "@/components/ui/week-off-picker";

export type RecruiterOption = { id: string; full_name: string | null; email: string; role?: string };

export default function CreateMandateForm({
  existingClients,
  recruiters = [],
  currentUserId,
  prefillClientId,
  prefillClientName,
}: {
  existingClients: string[];
  // Internal-only field -- never surfaced to clients or candidates in any
  // public/portal view. At least one recruiter or vendor is required at
  // creation time (single source of truth is mandate_assignments -- see
  // mandate-staffing-control.tsx on the detail page), rather than left to be
  // set later and forgotten. More than one can be picked here, and more can
  // always be added afterwards.
  recruiters?: RecruiterOption[];
  currentUserId?: string;
  // "Create a mandate now" shortcut from a client's detail page -- prefills
  // the client name and, as long as the recruiter doesn't retype it into a
  // different client's name, links the mandate's client_id directly instead
  // of relying on the client_name text matching up with an existing row.
  prefillClientId?: string;
  prefillClientName?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    client_name: prefillClientName ?? "",
    role_title: "",
    recruiterIds: currentUserId ? [currentUserId] : ([] as string[]),
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
    // Gold Standard Mandate Intake -- recruiter-only briefing fields, never
    // sent to the public jobs.staffanchor.com listing query.
    hiring_reason: "",
    team_handling: "",
    team_size_band: "",
    work_mode: "",
    working_days: "",
    shift_timing: "",
    reporting_manager_title: "",
    company_size_band: "",
    company_highlight_links: "",
    sales_cycle: "",
    deal_size_currency: "" as CurrencyValue | "",
    deal_size_band: "",
    customer_profile: "",
    expectation_3_month: "",
    expectation_6_month: "",
    expectation_1_year: "",
    selling_style: "",
    preferred_industries: [] as string[],
    industries_sold_to: [] as string[],
    languages_required: [] as string[],
    weekOff: emptyWeekOffValue as WeekOffValue,
    b2c_customer_types: [] as string[],
    client_profile: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [generatingJd, setGeneratingJd] = useState(false);
  const [jdError, setJdError] = useState("");
  const [briefOpen, setBriefOpen] = useState(false);
  const optionSets = useMandateOptionSets();

  const subDomainOptions = subDomainsForCategory(form.category || null);
  const isMultiSubDomain = form.category === "b2b_sales" || form.category === "b2c_sales";
  const isSalesRole = form.category === "b2b_sales" || form.category === "b2c_sales";
  const isB2B = form.category === "b2b_sales";
  const isB2C = form.category === "b2c_sales";
  const dealSizeOptions = dealSizeBandsFor(form.category || null, form.deal_size_currency);

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
          client_name: form.client_name,
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
    if (form.recruiterIds.length === 0) {
      setError("Select at least one recruiter or vendor.");
      return;
    }
    setSaving(true);
    setError("");
    const subDomains = resolvedSubDomains();
    // Only trust the prefilled client_id if the recruiter hasn't since
    // retyped the client name to something else -- otherwise this mandate
    // would silently get FK'd to the wrong client.
    const resolvedClientId = prefillClientId && form.client_name === prefillClientName ? prefillClientId : null;
    const { data, error } = await supabase
      .from("mandates")
      .insert({
        client_id: resolvedClientId,
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
        hiring_reason: form.hiring_reason || null,
        team_handling: form.team_handling || null,
        team_size_band: form.team_handling === "team_lead" ? form.team_size_band || null : null,
        work_mode: form.work_mode || null,
        working_days: form.working_days || null,
        shift_timing: form.shift_timing || null,
        reporting_manager_title: form.reporting_manager_title || null,
        company_size_band: form.company_size_band || null,
        company_highlight_links: form.company_highlight_links
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        sales_cycle: isSalesRole ? form.sales_cycle || null : null,
        deal_size_currency: isSalesRole ? form.deal_size_currency || null : null,
        deal_size_band: isSalesRole ? form.deal_size_band || null : null,
        customer_profile: isSalesRole ? form.customer_profile || null : null,
        expectation_3_month: form.expectation_3_month || null,
        expectation_6_month: form.expectation_6_month || null,
        expectation_1_year: form.expectation_1_year || null,
        selling_style: isSalesRole ? form.selling_style || null : null,
        preferred_industries: form.preferred_industries,
        industries_sold_to: isSalesRole ? form.industries_sold_to : [],
        languages_required: form.languages_required,
        week_off: form.weekOff.week_off_type === "fixed" ? form.weekOff.week_off : [],
        week_off_type: form.weekOff.week_off_type || null,
        rotational_offs_per_week: form.weekOff.week_off_type === "rotational" ? form.weekOff.rotational_offs_per_week || null : null,
        mandatory_working_days: form.weekOff.week_off_type === "rotational" ? form.weekOff.mandatory_working_days : [],
        b2c_customer_types: isB2C ? form.b2c_customer_types : [],
        client_profile: isB2B ? form.client_profile : [],
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

      // Staff every selected recruiter/vendor via the single shared
      // mechanism (mandate_assignments) rather than a bespoke owner_id write
      // -- this is what fires the in-app notification, and each call also
      // triggers a best-effort email so nobody has to be watching the bell.
      for (const recruiterId of form.recruiterIds) {
        await supabase.rpc("assign_mandate_staff", { p_mandate_id: data.id, p_freelancer_id: recruiterId });
        fetch("/api/notify-mandate-staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mandateId: data.id, freelancerId: recruiterId }),
        }).catch(() => {});
      }
    }
    setForm({
      client_name: "",
      role_title: "",
      recruiterIds: currentUserId ? [currentUserId] : [],
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
      hiring_reason: "",
      team_handling: "",
      team_size_band: "",
      work_mode: "",
      working_days: "",
      shift_timing: "",
      reporting_manager_title: "",
      company_size_band: "",
      company_highlight_links: "",
      sales_cycle: "",
      deal_size_currency: "",
      deal_size_band: "",
      customer_profile: "",
      expectation_3_month: "",
      expectation_6_month: "",
      expectation_1_year: "",
      selling_style: "",
      preferred_industries: [],
      industries_sold_to: [],
      languages_required: [],
      weekOff: emptyWeekOffValue,
      b2c_customer_types: [],
      client_profile: [],
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
          Recruiter / Vendor (internal only — never shown to the client or candidates){" "}
          <span className="font-normal text-slate-400">at least one is required; add more anytime</span>
        </p>
        <MultiSelectChips
          options={recruiters.map((r) => ({
            value: r.id,
            label: (r.full_name ?? r.email) + (r.role === "freelancer" ? " (vendor)" : ""),
          }))}
          selected={form.recruiterIds}
          onChange={(next) => setForm((f) => ({ ...f, recruiterIds: next }))}
          placeholder="Search recruiters / vendors..."
        />
      </div>

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
            onChange={(e) => {
              // Adds immediately on selection -- a separate "Add" click
              // after picking from this dropdown was easy to miss.
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
          placeholder="Fixed CTC min (LPA)"
          value={form.budget_min}
          onChange={(e) => setForm((f) => ({ ...f, budget_min: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <input
          type="number"
          placeholder="Fixed CTC max (LPA)"
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
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Preferred candidate industries (background)</p>
        <MultiSelectChips
          options={optionSets.industries}
          selected={form.preferred_industries}
          onChange={(next) => setForm((f) => ({ ...f, preferred_industries: next }))}
          placeholder="Search industries..."
        />
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Languages required</p>
        <MultiSelectChips
          options={optionSets.languages}
          selected={form.languages_required}
          onChange={(next) => setForm((f) => ({ ...f, languages_required: next }))}
          placeholder="Search languages..."
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

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setBriefOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 dark:bg-slate-800/50 text-left"
        >
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
            Gold Standard Brief <span className="font-normal text-slate-400">(recommended -- recruiter-only, never shown publicly)</span>
          </span>
          {briefOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {briefOpen && (
          <div className="p-3 space-y-2.5 border-t border-slate-200 dark:border-slate-700">
            <div className="flex gap-2">
              <select
                value={form.hiring_reason}
                onChange={(e) => setForm((f) => ({ ...f, hiring_reason: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">New role or replacement?</option>
                {hiringReasonOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={form.team_handling}
                onChange={(e) => setForm((f) => ({ ...f, team_handling: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">IC or team lead?</option>
                {teamHandlingOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {form.team_handling === "team_lead" && (
              <select
                value={form.team_size_band}
                onChange={(e) => setForm((f) => ({ ...f, team_size_band: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Team size to manage...</option>
                {teamSizeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}

            {isSalesRole && (
              <>
                <select
                  value={form.selling_style}
                  onChange={(e) => setForm((f) => ({ ...f, selling_style: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Selling style: Hunter, Farmer, or Hybrid?</option>
                  {optionSets.selling_style.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Industries sold to / clientele</p>
                  <MultiSelectChips
                    options={optionSets.industries}
                    selected={form.industries_sold_to}
                    onChange={(next) => setForm((f) => ({ ...f, industries_sold_to: next }))}
                    placeholder="Search industries..."
                  />
                </div>
                <select
                  value={form.sales_cycle}
                  onChange={(e) => setForm((f) => ({ ...f, sales_cycle: e.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Typical sales cycle for this role...</option>
                  {salesCycleOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <select
                    value={form.deal_size_currency}
                    onChange={(e) => setForm((f) => ({ ...f, deal_size_currency: e.target.value as CurrencyValue | "", deal_size_band: "" }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Currency...</option>
                    {currencyOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  <select
                    value={form.deal_size_band}
                    onChange={(e) => setForm((f) => ({ ...f, deal_size_band: e.target.value }))}
                    disabled={!form.deal_size_currency}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:opacity-50"
                  >
                    <option value="">Typical deal size...</option>
                    {dealSizeOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  placeholder="Target customer profile / clientele this role sells to"
                  value={form.customer_profile}
                  onChange={(e) => setForm((f) => ({ ...f, customer_profile: e.target.value }))}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm resize-y"
                />

                {isB2C && (
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Who are the end consumers? (B2C)
                    </p>
                    <MultiSelectChips
                      options={b2cCustomerTypeOptions.map((o) => ({ value: o, label: o }))}
                      selected={form.b2c_customer_types}
                      onChange={(next) => setForm((f) => ({ ...f, b2c_customer_types: next }))}
                      placeholder="Search consumer types..."
                    />
                  </div>
                )}

                {isB2B && (
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Client profile -- who do they actually sell to? (B2B)
                    </p>
                    <MultiSelectChips
                      options={clientProfileOptions.map((o) => ({ value: o, label: o }))}
                      selected={form.client_profile}
                      onChange={(next) => setForm((f) => ({ ...f, client_profile: next }))}
                      placeholder="Search titles..."
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2">
              <select
                value={form.work_mode}
                onChange={(e) => setForm((f) => ({ ...f, work_mode: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Work mode...</option>
                {workModeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                value={form.working_days}
                onChange={(e) => setForm((f) => ({ ...f, working_days: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Working days...</option>
                {workingDaysOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <select
                value={form.shift_timing}
                onChange={(e) => setForm((f) => ({ ...f, shift_timing: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Shift...</option>
                {shiftTimingOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>

            <WeekOffPicker value={form.weekOff} onChange={(next) => setForm((f) => ({ ...f, weekOff: next }))} />

            <div className="flex gap-2">
              <input
                placeholder="Reports to (title, e.g. VP Sales)"
                value={form.reporting_manager_title}
                onChange={(e) => setForm((f) => ({ ...f, reporting_manager_title: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <select
                value={form.company_size_band}
                onChange={(e) => setForm((f) => ({ ...f, company_size_band: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Company size...</option>
                {teamSizeOptions.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <input
              placeholder="Company highlight links, comma-separated (funding news, website, LinkedIn)"
              value={form.company_highlight_links}
              onChange={(e) => setForm((f) => ({ ...f, company_highlight_links: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />

            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 pt-1">Realistic expectations (for candidate conversations, not published)</p>
            <input
              placeholder="3-month expectation"
              value={form.expectation_3_month}
              onChange={(e) => setForm((f) => ({ ...f, expectation_3_month: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="6-month expectation"
              value={form.expectation_6_month}
              onChange={(e) => setForm((f) => ({ ...f, expectation_6_month: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <input
              placeholder="1-year expectation"
              value={form.expectation_1_year}
              onChange={(e) => setForm((f) => ({ ...f, expectation_1_year: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}
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
        disabled={saving || form.recruiterIds.length === 0}
        title={form.recruiterIds.length === 0 ? "Select at least one recruiter or vendor above" : undefined}
        className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Creating..." : "Create mandate"}
      </button>
    </form>
  );
}
