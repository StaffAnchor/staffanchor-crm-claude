"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Sparkles,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  ShieldCheck,
} from "lucide-react";
import {
  type ProfileTimelineEntry,
  type ResumeTimelineEntry,
  mergeTimelines,
  computeStabilityScore,
  computeDomainConsistencyScore,
  computeCareerGaps,
} from "@/lib/career-timeline";
import {
  profileTypeOptions,
  level1OptionsForProfileType,
  industryOptions,
  customerSegmentOptions,
  dealSizeBandsFor,
  salesCycleOptions,
  sellingStyleOptions,
  salesMotionOptions,
  b2cSalesMotionOptions,
  clientProfileOptions,
  b2cCustomerTypeOptions,
  insideSalesSubDomains,
  ahtOptions,
  dailyCallTargetOptions,
  dailyTalkTimeOptions,
  leadSourceOptions,
  teamSizeOptions,
  achievementBandOptions,
  renewalRateBandOptions,
  winRateBandOptions,
  geographicScopeOptions,
  reasonForLeavingOptions,
  avgQuarterlyTargetBandOptions,
  currencyOptions,
  territoryRegionOptions,
  commercialRouteOptions,
  targetAccountTypeOptions,
  productComplexityOptions,
  type CurrencyValue,
} from "@/lib/candidate-options";

// Now uses the unified Profile Type -> Practice/Vertical/Function taxonomy
// (see /candidates/new/page.tsx for the same pattern) instead of the old flat
// subDomainsForCategory list. `category` and `sub_domain` column names are
// unchanged -- sub_domain now holds the Level 1 (Practice/Vertical/Function)
// value, e.g. "Enterprise Tech Sales & Revenue", "Retail", "Marketing".
const CATEGORY_OPTIONS = profileTypeOptions;

const INPUT_CLS =
  "w-full rounded-ros-md border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[13px] transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white dark:bg-slate-900";

function subDomainLabelFor(category: string): string {
  if (category === "b2b_sales") return "Practice";
  if (category === "b2c_sales") return "Vertical";
  if (category === "non_sales") return "Function";
  return "Practice / Vertical / Function";
}

function emptyEntry(): ProfileTimelineEntry {
  return {
    id: crypto.randomUUID(),
    company: "",
    title: "",
    category: "",
    sub_domain: "",
    industry: "",
    customer_segment: "",
    deal_size_band: "",
    sales_cycle: "",
    selling_style: "",
    team_size: "",
    start_month: "",
    end_month: null,
    revenue_generated: "",
    quota_attainment_band: "",
    largest_deal_band: "",
    largest_deal_currency: "",
    new_logos_count: "",
    renewal_rate_band: "",
    win_rate_band: "",
    reporting_to: "",
    client_tier: "",
    geo_scope: "",
    sales_motion: "",
    decision_maker_persona: "",
    customer_type: "",
    territory_region: "",
    commercial_route: "",
    target_account_type: "",
    product_complexity: "",
    aht: "",
    daily_call_target: "",
    daily_talk_time: "",
    lead_source: "",
    reason_for_leaving: "",
    avg_quarterly_target_band: "",
    avg_quarterly_revenue_value: "",
    avg_quarterly_revenue_currency: "",
    target_currency: "",
    target_q1: "",
    target_q2: "",
    target_q3: "",
    target_q4: "",
    achieved_q1: "",
    achieved_q2: "",
    achieved_q3: "",
    achieved_q4: "",
    has_ic_target_too: "",
    ic_target_currency: "",
    ic_target_q1: "",
    ic_target_q2: "",
    ic_target_q3: "",
    ic_target_q4: "",
    ic_achieved_q1: "",
    ic_achieved_q2: "",
    ic_achieved_q3: "",
    ic_achieved_q4: "",
    best_win: "",
    tough_loss: "",
  };
}

// Compact quarter-target-vs-achievement input, reused for both the team and
// individual grids on the current-role card -- mirrors jobs-staffanchor-clean's
// CareerTimelinePanel.tsx QuarterField exactly (same fields, same layout),
// just restyled with the CRM's own INPUT_CLS/typography conventions.
function QuarterField({
  label,
  targetValue,
  onTarget,
  achievementValue,
  onAchievement,
  currencyLabel,
}: {
  label: string;
  targetValue: string;
  onTarget: (v: string) => void;
  achievementValue: string;
  onAchievement: (v: string) => void;
  currencyLabel?: string;
}) {
  return (
    <div className="space-y-2 rounded-ros-md border border-slate-200 dark:border-slate-700 p-2.5">
      <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <div>
        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
          Quarterly Target{currencyLabel ? ` (${currencyLabel})` : ""}
        </label>
        <input
          type="number"
          placeholder="Full quarter, not monthly"
          value={targetValue}
          onChange={(e) => onTarget(e.target.value)}
          className={INPUT_CLS}
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Achieved %</label>
        <div className="flex flex-wrap gap-1">
          {achievementBandOptions.map((o) => {
            const active = achievementValue === o;
            return (
              <button
                type="button"
                key={o}
                onClick={() => onAchievement(o)}
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors duration-200 ease-ros ${
                  active
                    ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                    : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-400"
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function monthLabel(m: string | null): string {
  if (!m) return "Present";
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export default function CareerTimelinePanel({
  candidateId,
  currentEmployer,
  initialProfileEntries,
  initialResumeEntries,
  initialStabilityScore,
  initialDomainConsistencyScore,
  hasResumeText,
}: {
  candidateId: string;
  currentEmployer: string | null;
  initialProfileEntries: ProfileTimelineEntry[];
  initialResumeEntries: ResumeTimelineEntry[];
  initialStabilityScore: number | null;
  initialDomainConsistencyScore: number | null;
  hasResumeText: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [profileEntries, setProfileEntries] = useState<ProfileTimelineEntry[]>(initialProfileEntries ?? []);
  const [resumeEntries] = useState<ResumeTimelineEntry[]>(initialResumeEntries ?? []);
  const [form, setForm] = useState<ProfileTimelineEntry | null>(null);
  const [dealCurrency, setDealCurrency] = useState<CurrencyValue>("INR");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState("");

  const merged = useMemo(() => mergeTimelines(profileEntries, resumeEntries), [profileEntries, resumeEntries]);
  const stability = useMemo(() => computeStabilityScore(merged), [merged]);
  const domainConsistency = useMemo(() => computeDomainConsistencyScore(profileEntries), [profileEntries]);
  const gaps = useMemo(
    () => computeCareerGaps({ profileEntries, resumeEntries, currentEmployer }),
    [profileEntries, resumeEntries, currentEmployer]
  );

  const stabilityScore = stability?.score ?? initialStabilityScore;
  const stabilityLabel = stability?.label;
  const domainScore = domainConsistency?.score ?? initialDomainConsistencyScore;

  function set<K extends keyof ProfileTimelineEntry>(key: K, value: ProfileTimelineEntry[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function persistEntries(next: ProfileTimelineEntry[]) {
    setSaving(true);
    setError("");
    const merged2 = mergeTimelines(next, resumeEntries);
    const stab = computeStabilityScore(merged2);
    const dom = computeDomainConsistencyScore(next);
    const { error: err } = await supabase
      .from("candidates")
      .update({
        career_timeline_profile: next,
        stability_score: stab?.score ?? null,
        domain_consistency_score: dom?.score ?? null,
      })
      .eq("id", candidateId);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setProfileEntries(next);
    router.refresh();
  }

  async function handleSaveForm() {
    if (!form) return;
    if (!form.company.trim() || !form.start_month) {
      setError("Company and start month are required.");
      return;
    }
    const exists = profileEntries.some((e) => e.id === form.id);
    const next = exists ? profileEntries.map((e) => (e.id === form.id ? form : e)) : [...profileEntries, form];
    await persistEntries(next);
    setForm(null);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Remove this role from the profile timeline?")) return;
    await persistEntries(profileEntries.filter((e) => e.id !== id));
  }

  function startAdd(prefill?: Partial<ProfileTimelineEntry>) {
    setError("");
    setForm({ ...emptyEntry(), ...prefill });
  }

  function startEdit(entry: ProfileTimelineEntry) {
    setError("");
    setForm({ ...entry });
  }

  async function handleRegenerate() {
    setRegenerating(true);
    setError("");
    try {
      const res = await fetch("/api/generate-career-timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidate_id: candidateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to regenerate from resume.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to regenerate from resume.");
    } finally {
      setRegenerating(false);
    }
  }

  const isSalesCategory = form?.category === "b2b_sales" || form?.category === "b2c_sales";
  const isB2B = form?.category === "b2b_sales";
  const isB2C = form?.category === "b2c_sales";
  const isIndustrial = isB2B && form?.sub_domain === "Industrial & Infrastructure";
  const isCurrentRole = form?.end_month === null;
  const isInsideSalesRole = !!form?.sub_domain && insideSalesSubDomains.includes(form.sub_domain);
  const isTeamLead = !!form?.team_size;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <BriefcaseBusiness className="w-3.5 h-3.5 text-slate-400" /> Career Timeline
        </h2>
        <button
          onClick={handleRegenerate}
          disabled={regenerating || !hasResumeText}
          title={hasResumeText ? undefined : "No resume text on file yet"}
          className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" /> {regenerating ? "Reading resume..." : "Regenerate from resume"}
        </button>
      </div>
      <p className="text-[12px] text-slate-400 mb-3">
        Per-job history from two sources -- the resume (auto-extracted) and the confirmed profile. Scores use
        whichever is more trustworthy for each role.
      </p>

      {(stabilityScore != null || domainScore != null) && (
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          {stabilityScore != null && (
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {stabilityScore}<span className="text-[11px] font-normal text-slate-400">/100</span>
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  Stability{stabilityLabel ? ` -- ${stabilityLabel}` : ""}
                </p>
              </div>
            </div>
          )}
          {domainScore != null && (
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                <ShieldCheck className="w-4 h-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                  {domainScore}<span className="text-[11px] font-normal text-slate-400">/100</span>
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Domain consistency</p>
              </div>
            </div>
          )}
        </div>
      )}

      {gaps.length > 0 && (
        <div className="mb-4 space-y-1.5">
          {gaps.map((gap, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-ros-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-2.5 py-2"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="flex-1 text-[12px] text-amber-800 dark:text-amber-400">{gap.message}</p>
              {gap.type === "resume_not_in_profile" && (
                <button
                  onClick={() =>
                    startAdd({
                      company: gap.resumeEntry.company,
                      title: gap.resumeEntry.title,
                      start_month: gap.resumeEntry.start_month || "",
                      end_month: gap.resumeEntry.end_month,
                    })
                  }
                  className="shrink-0 text-[11px] font-medium text-amber-700 hover:text-amber-900 underline"
                >
                  Confirm &amp; add
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-4">
        {resumeEntries.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              From resume <span className="normal-case font-normal text-slate-400">(unconfirmed)</span>
            </h3>
            <div className="space-y-1.5">
              {resumeEntries.map((e) => (
                <div key={e.id} className="rounded-ros-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      {e.title || "Role"} <span className="text-slate-400 font-normal">at {e.company}</span>
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {monthLabel(e.start_month)} – {monthLabel(e.end_month)}
                    </p>
                  </div>
                  {e.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{e.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
            Confirmed in profile
          </h3>
          {profileEntries.length === 0 && (
            <p className="text-[12px] text-slate-400 rounded-ros-lg border border-dashed border-slate-200 dark:border-slate-700 px-3 py-2 mb-2">
              No confirmed roles yet.
            </p>
          )}
          <div className="space-y-1.5">
            {[...profileEntries]
              .sort((a, b) => (a.start_month < b.start_month ? 1 : -1))
              .map((e) => (
                <div key={e.id} className="rounded-ros-lg border border-slate-200 dark:border-slate-700 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">
                        {e.title || "Role"} <span className="text-slate-400 font-normal">at {e.company}</span>
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {monthLabel(e.start_month)} – {monthLabel(e.end_month)}
                        {e.sub_domain ? ` · ${e.sub_domain}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => startEdit(e)} className="text-slate-400 hover:text-blue-600 p-1">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="text-slate-400 hover:text-red-600 p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-600 mt-3">{error}</p>}

      {!form ? (
        <button
          onClick={() => startAdd()}
          className="mt-3 flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700"
        >
          <Plus className="w-3.5 h-3.5" /> Add a role
        </button>
      ) : (
        <div className="mt-3 rounded-ros-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Company</label>
              <input value={form.company} onChange={(e) => set("company", e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Title</label>
              <input value={form.title} onChange={(e) => set("title", e.target.value)} className={INPUT_CLS} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Start month</label>
              <input
                type="month"
                value={form.start_month}
                onChange={(e) => set("start_month", e.target.value)}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">End month</label>
              <input
                type="month"
                value={form.end_month ?? ""}
                disabled={form.end_month === null && form.start_month !== ""}
                onChange={(e) => set("end_month", e.target.value || null)}
                className={INPUT_CLS}
              />
              <label className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={form.end_month === null}
                  onChange={(e) => set("end_month", e.target.checked ? null : "")}
                />
                Current role
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Profile Type</label>
              <select
                value={form.category}
                onChange={(e) => set("category", e.target.value as ProfileTimelineEntry["category"])}
                className={INPUT_CLS}
              >
                <option value="">Select...</option>
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                {subDomainLabelFor(form.category)}
              </label>
              <select
                value={form.sub_domain}
                onChange={(e) => set("sub_domain", e.target.value)}
                disabled={!form.category}
                className={INPUT_CLS}
              >
                <option value="">Select...</option>
                {level1OptionsForProfileType(form.category || null).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Industry</label>
            <select value={form.industry} onChange={(e) => set("industry", e.target.value)} className={INPUT_CLS}>
              <option value="">Select...</option>
              {industryOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {isSalesCategory && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Customer segment</label>
                  <select
                    value={form.customer_segment}
                    onChange={(e) => set("customer_segment", e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    {customerSegmentOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Sales cycle</label>
                  <select value={form.sales_cycle} onChange={(e) => set("sales_cycle", e.target.value)} className={INPUT_CLS}>
                    <option value="">Select...</option>
                    {salesCycleOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Selling style</label>
                  <select value={form.selling_style} onChange={(e) => set("selling_style", e.target.value)} className={INPUT_CLS}>
                    <option value="">Select...</option>
                    {sellingStyleOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Deal size
                    <button
                      type="button"
                      onClick={() => setDealCurrency((c) => (c === "INR" ? "USD" : "INR"))}
                      className="ml-1.5 text-blue-600"
                    >
                      ({dealCurrency})
                    </button>
                  </label>
                  <select value={form.deal_size_band} onChange={(e) => set("deal_size_band", e.target.value)} className={INPUT_CLS}>
                    <option value="">Select...</option>
                    {dealSizeBandsFor(form.category, dealCurrency).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isIndustrial && (
                <div className="space-y-2 rounded-ros-lg border border-dashed border-slate-200 dark:border-slate-700 p-2.5">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Industrial &amp; Infrastructure specifics
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Territory / Region</label>
                      <select
                        value={form.territory_region ?? ""}
                        onChange={(e) => set("territory_region", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {territoryRegionOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Commercial route</label>
                      <select
                        value={form.commercial_route ?? ""}
                        onChange={(e) => set("commercial_route", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {commercialRouteOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Target account type</label>
                      <select
                        value={form.target_account_type ?? ""}
                        onChange={(e) => set("target_account_type", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {targetAccountTypeOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Product complexity</label>
                      <select
                        value={form.product_complexity ?? ""}
                        onChange={(e) => set("product_complexity", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {productComplexityOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Sales motion</label>
                  <select value={form.sales_motion ?? ""} onChange={(e) => set("sales_motion", e.target.value)} className={INPUT_CLS}>
                    <option value="">Select...</option>
                    {(isB2C ? b2cSalesMotionOptions : salesMotionOptions).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                {isB2B && (
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Who you sold to (decision-maker)
                    </label>
                    <select
                      value={form.decision_maker_persona ?? ""}
                      onChange={(e) => set("decision_maker_persona", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select...</option>
                      {clientProfileOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {isB2C && (
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Customer type</label>
                    <select
                      value={form.customer_type ?? ""}
                      onChange={(e) => set("customer_type", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select...</option>
                      {b2cCustomerTypeOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {isInsideSalesRole && (
                <div className="rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-2.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Inside sales detail
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                        Average handling time (AHT)
                      </label>
                      <select value={form.aht ?? ""} onChange={(e) => set("aht", e.target.value)} className={INPUT_CLS}>
                        <option value="">Select...</option>
                        {ahtOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Daily call target</label>
                      <select
                        value={form.daily_call_target ?? ""}
                        onChange={(e) => set("daily_call_target", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {dailyCallTargetOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Daily talk time</label>
                      <select
                        value={form.daily_talk_time ?? ""}
                        onChange={(e) => set("daily_talk_time", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {dailyTalkTimeOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Primary lead source</label>
                      <select
                        value={form.lead_source ?? ""}
                        onChange={(e) => set("lead_source", e.target.value)}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {leadSourceOptions.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <div>
            <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Team size led (if any)</label>
            <select value={form.team_size} onChange={(e) => set("team_size", e.target.value)} className={INPUT_CLS}>
              <option value="">Individual contributor / not applicable</option>
              {teamSizeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
              Revenue impact{" "}
              <span className="normal-case font-normal text-slate-400">
                {isCurrentRole
                  ? "-- target vs. achievement for this role is captured further down"
                  : "-- optional, powers the Sales Passport"}
              </span>
            </p>

            {!isCurrentRole && isSalesCategory && (
              <div className="mb-2 rounded-ros-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2.5">
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Average quarterly revenue generated
                </label>
                <div className="grid grid-cols-[80px_1fr] gap-1.5">
                  <select
                    value={form.avg_quarterly_revenue_currency || "INR"}
                    onChange={(e) => set("avg_quarterly_revenue_currency", e.target.value)}
                    className={INPUT_CLS}
                  >
                    {currencyOptions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Full quarter average, not monthly -- numbers only"
                    value={form.avg_quarterly_revenue_value ?? ""}
                    onChange={(e) => set("avg_quarterly_revenue_value", e.target.value)}
                    className={INPUT_CLS}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Revenue generated (total for this role)
                </label>
                <input
                  placeholder="e.g. ₹82 Cr"
                  value={form.revenue_generated ?? ""}
                  onChange={(e) => set("revenue_generated", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              {isCurrentRole ? (
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Quota attainment</label>
                  <select
                    value={form.quota_attainment_band ?? ""}
                    onChange={(e) => set("quota_attainment_band", e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    {achievementBandOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Average quarterly target (band)</label>
                  <select
                    value={form.avg_quarterly_target_band ?? ""}
                    onChange={(e) => set("avg_quarterly_target_band", e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    {avgQuarterlyTargetBandOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  Largest deal closed
                  <button
                    type="button"
                    onClick={() =>
                      set("largest_deal_currency", (form.largest_deal_currency === "USD" ? "INR" : "USD") as string)
                    }
                    className="ml-1.5 text-blue-600"
                  >
                    ({form.largest_deal_currency || "INR"})
                  </button>
                </label>
                <select
                  value={form.largest_deal_band ?? ""}
                  onChange={(e) => set("largest_deal_band", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {dealSizeBandsFor(form.category, (form.largest_deal_currency as CurrencyValue) || "INR").map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">New logos won</label>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 22"
                  value={form.new_logos_count ?? ""}
                  onChange={(e) => set("new_logos_count", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Renewal rate</label>
                <select
                  value={form.renewal_rate_band ?? ""}
                  onChange={(e) => set("renewal_rate_band", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {renewalRateBandOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Win rate</label>
                <select
                  value={form.win_rate_band ?? ""}
                  onChange={(e) => set("win_rate_band", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {winRateBandOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Reporting to</label>
                <input
                  placeholder="e.g. VP Sales"
                  value={form.reporting_to ?? ""}
                  onChange={(e) => set("reporting_to", e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Client tier</label>
                <select
                  value={form.client_tier ?? ""}
                  onChange={(e) => set("client_tier", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {customerSegmentOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Geographic scope</label>
                <select
                  value={form.geo_scope ?? ""}
                  onChange={(e) => set("geo_scope", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {geographicScopeOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              {!isCurrentRole && (
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Reason for leaving</label>
                  <select
                    value={form.reason_for_leaving ?? ""}
                    onChange={(e) => set("reason_for_leaving", e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    {reasonForLeavingOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {isCurrentRole && isSalesCategory && (
            <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                Performance{" "}
                <span className="normal-case font-normal text-slate-400">
                  -- real target vs. achievement for the current role
                </span>
              </p>
              <p className="mb-2 rounded-ros-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2.5 py-1.5 text-[12px] text-slate-600 dark:text-slate-400">
                {isTeamLead ? (
                  <>
                    Team size led is <strong>{form.team_size}</strong> in this role, so the target below is the{" "}
                    <strong>team&apos;s overall</strong> quarterly number, not just the candidate&apos;s own.
                  </>
                ) : (
                  <>
                    Individual contributor in this role, so the target below is <strong>their own</strong> quarterly
                    number.
                  </>
                )}
              </p>
              <div>
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  {isTeamLead ? "Team target currency" : "Target currency"}
                </label>
                <select
                  value={form.target_currency ?? ""}
                  onChange={(e) => set("target_currency", e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Select...</option>
                  {currencyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <QuarterField
                  label="4 quarters ago"
                  targetValue={form.target_q1 ?? ""}
                  onTarget={(v) => set("target_q1", v)}
                  achievementValue={form.achieved_q1 ?? ""}
                  onAchievement={(v) => set("achieved_q1", v)}
                  currencyLabel={form.target_currency}
                />
                <QuarterField
                  label="3 quarters ago"
                  targetValue={form.target_q2 ?? ""}
                  onTarget={(v) => set("target_q2", v)}
                  achievementValue={form.achieved_q2 ?? ""}
                  onAchievement={(v) => set("achieved_q2", v)}
                  currencyLabel={form.target_currency}
                />
                <QuarterField
                  label="2 quarters ago"
                  targetValue={form.target_q3 ?? ""}
                  onTarget={(v) => set("target_q3", v)}
                  achievementValue={form.achieved_q3 ?? ""}
                  onAchievement={(v) => set("achieved_q3", v)}
                  currencyLabel={form.target_currency}
                />
                <QuarterField
                  label="Most recent completed quarter"
                  targetValue={form.target_q4 ?? ""}
                  onTarget={(v) => set("target_q4", v)}
                  achievementValue={form.achieved_q4 ?? ""}
                  onAchievement={(v) => set("achieved_q4", v)}
                  currencyLabel={form.target_currency}
                />
              </div>

              {isTeamLead && (
                <div className="mt-3">
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Does this role also carry an individual sales target?
                  </label>
                  <select
                    value={form.has_ic_target_too ?? ""}
                    onChange={(e) => set("has_ic_target_too", e.target.value)}
                    className={INPUT_CLS}
                  >
                    <option value="">Select...</option>
                    <option value="Yes">Yes</option>
                    <option value="No">No</option>
                  </select>
                </div>
              )}

              {isTeamLead && form.has_ic_target_too === "Yes" && (
                <div className="mt-3 rounded-ros-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-2.5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Individual target (in addition to the team number)
                  </p>
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Individual target currency
                    </label>
                    <select
                      value={form.ic_target_currency ?? ""}
                      onChange={(e) => set("ic_target_currency", e.target.value)}
                      className={INPUT_CLS}
                    >
                      <option value="">Select...</option>
                      {currencyOptions.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <QuarterField
                      label="4 quarters ago"
                      targetValue={form.ic_target_q1 ?? ""}
                      onTarget={(v) => set("ic_target_q1", v)}
                      achievementValue={form.ic_achieved_q1 ?? ""}
                      onAchievement={(v) => set("ic_achieved_q1", v)}
                      currencyLabel={form.ic_target_currency}
                    />
                    <QuarterField
                      label="3 quarters ago"
                      targetValue={form.ic_target_q2 ?? ""}
                      onTarget={(v) => set("ic_target_q2", v)}
                      achievementValue={form.ic_achieved_q2 ?? ""}
                      onAchievement={(v) => set("ic_achieved_q2", v)}
                      currencyLabel={form.ic_target_currency}
                    />
                    <QuarterField
                      label="2 quarters ago"
                      targetValue={form.ic_target_q3 ?? ""}
                      onTarget={(v) => set("ic_target_q3", v)}
                      achievementValue={form.ic_achieved_q3 ?? ""}
                      onAchievement={(v) => set("ic_achieved_q3", v)}
                      currencyLabel={form.ic_target_currency}
                    />
                    <QuarterField
                      label="Most recent completed quarter"
                      targetValue={form.ic_target_q4 ?? ""}
                      onTarget={(v) => set("ic_target_q4", v)}
                      achievementValue={form.ic_achieved_q4 ?? ""}
                      onAchievement={(v) => set("ic_achieved_q4", v)}
                      currencyLabel={form.ic_target_currency}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  A target crushed, and how it was done
                </label>
                <textarea
                  value={form.best_win ?? ""}
                  onChange={(e) => set("best_win", e.target.value)}
                  rows={3}
                  placeholder="Min. 100 characters -- what happened, and how they pulled it off."
                  className={INPUT_CLS}
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">{(form.best_win ?? "").length} / 500 (min 100)</p>
              </div>
              <div className="mt-2">
                <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                  A target missed, and what was learned
                </label>
                <textarea
                  value={form.tough_loss ?? ""}
                  onChange={(e) => set("tough_loss", e.target.value)}
                  rows={3}
                  placeholder="Min. 100 characters -- what happened, and what changed afterward."
                  className={INPUT_CLS}
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">{(form.tough_loss ?? "").length} / 500 (min 100)</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSaveForm}
              disabled={saving}
              className="flex-1 rounded-ros-md bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save role"}
            </button>
            <button
              onClick={() => setForm(null)}
              className="rounded-ros-md border border-slate-300 dark:border-slate-700 px-3 text-[13px] text-slate-600 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
