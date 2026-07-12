"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, X, Check, ClipboardList } from "lucide-react";
import {
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
import WeekOffPicker, { type WeekOffValue } from "@/components/ui/week-off-picker";

// The recruiter-only "Gold Standard Brief" fields -- everything here is
// deliberately excluded from the public jobs.staffanchor.com listing query,
// so it's safe to be candid/detailed without worrying about it going live.
// No gender/demographic preference field is included by design: that's a
// discrimination/compliance risk in hiring software, left out intentionally.
export type GoldStandardDetails = {
  category: string | null;
  hiring_reason: string | null;
  team_handling: string | null;
  team_size_band: string | null;
  work_mode: string | null;
  working_days: string | null;
  shift_timing: string | null;
  reporting_manager_title: string | null;
  company_size_band: string | null;
  company_highlight_links: string[] | null;
  sales_cycle: string | null;
  deal_size_currency: string | null;
  deal_size_band: string | null;
  customer_profile: string | null;
  expectation_3_month: string | null;
  expectation_6_month: string | null;
  expectation_1_year: string | null;
  selling_style: string | null;
  preferred_industries: string[] | null;
  industries_sold_to: string[] | null;
  languages_required: string[] | null;
  week_off: string[] | null;
  week_off_type: string | null;
  rotational_offs_per_week: number | null;
  mandatory_working_days: string[] | null;
  b2c_customer_types: string[] | null;
  client_profile: string[] | null;
};

const HIRING_REASON_LABEL: Record<string, string> = Object.fromEntries(hiringReasonOptions.map((o) => [o.value, o.label]));
const TEAM_HANDLING_LABEL: Record<string, string> = Object.fromEntries(teamHandlingOptions.map((o) => [o.value, o.label]));

export default function GoldStandardPanel({ mandateId, initial }: { mandateId: string; initial: GoldStandardDetails }) {
  const router = useRouter();
  const supabase = createClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const isSalesRole = initial.category === "b2b_sales" || initial.category === "b2c_sales";
  const isB2B = initial.category === "b2b_sales";
  const isB2C = initial.category === "b2c_sales";
  const optionSets = useMandateOptionSets();

  const [form, setForm] = useState({
    hiring_reason: initial.hiring_reason ?? "",
    team_handling: initial.team_handling ?? "",
    team_size_band: initial.team_size_band ?? "",
    work_mode: initial.work_mode ?? "",
    working_days: initial.working_days ?? "",
    shift_timing: initial.shift_timing ?? "",
    reporting_manager_title: initial.reporting_manager_title ?? "",
    company_size_band: initial.company_size_band ?? "",
    company_highlight_links: (initial.company_highlight_links ?? []).join(", "),
    sales_cycle: initial.sales_cycle ?? "",
    deal_size_currency: (initial.deal_size_currency ?? "") as CurrencyValue | "",
    deal_size_band: initial.deal_size_band ?? "",
    customer_profile: initial.customer_profile ?? "",
    expectation_3_month: initial.expectation_3_month ?? "",
    expectation_6_month: initial.expectation_6_month ?? "",
    expectation_1_year: initial.expectation_1_year ?? "",
    selling_style: initial.selling_style ?? "",
    preferred_industries: initial.preferred_industries ?? ([] as string[]),
    industries_sold_to: initial.industries_sold_to ?? ([] as string[]),
    languages_required: initial.languages_required ?? ([] as string[]),
    weekOff: {
      week_off_type: (initial.week_off_type as WeekOffValue["week_off_type"]) ?? "",
      week_off: initial.week_off ?? [],
      rotational_offs_per_week: (initial.rotational_offs_per_week as WeekOffValue["rotational_offs_per_week"]) ?? "",
      mandatory_working_days: initial.mandatory_working_days ?? [],
    } as WeekOffValue,
    b2c_customer_types: initial.b2c_customer_types ?? ([] as string[]),
    client_profile: initial.client_profile ?? ([] as string[]),
  });

  const dealSizeOptions = dealSizeBandsFor(initial.category, form.deal_size_currency);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError("");
    const { error: err } = await supabase
      .from("mandates")
      .update({
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

  const summaryLines = [
    initial.hiring_reason && HIRING_REASON_LABEL[initial.hiring_reason],
    initial.team_handling &&
      (initial.team_handling === "team_lead" ? `Leads a team${initial.team_size_band ? ` (${initial.team_size_band})` : ""}` : TEAM_HANDLING_LABEL[initial.team_handling]),
    initial.work_mode,
    initial.working_days,
    initial.week_off_type === "fixed" &&
      initial.week_off &&
      initial.week_off.length > 0 &&
      `Off: ${initial.week_off.join(", ")}`,
    initial.week_off_type === "rotational" &&
      initial.rotational_offs_per_week &&
      `${initial.rotational_offs_per_week} rotational off${initial.rotational_offs_per_week > 1 ? "s" : ""}/week${
        initial.mandatory_working_days && initial.mandatory_working_days.length > 0
          ? ` (${initial.mandatory_working_days.join(", ")} mandatory)`
          : ""
      }`,
    isSalesRole && initial.sales_cycle && `${initial.sales_cycle} sales cycle`,
    isSalesRole && initial.deal_size_band && `Deal size ${initial.deal_size_band}`,
    isSalesRole && initial.selling_style && `${initial.selling_style} seller`,
    isB2C && initial.b2c_customer_types && initial.b2c_customer_types.length > 0 && `Sells to: ${initial.b2c_customer_types.join(", ")}`,
    isB2B && initial.client_profile && initial.client_profile.length > 0 && `Talks to: ${initial.client_profile.join(", ")}`,
    initial.languages_required && initial.languages_required.length > 0 && `Languages: ${initial.languages_required.join(", ")}`,
  ].filter(Boolean);

  if (!editing) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
            <ClipboardList className="w-3.5 h-3.5 text-slate-400" /> Gold Standard Brief
          </h2>
          <button onClick={() => setEditing(true)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
        {summaryLines.length > 0 ? (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1">{summaryLines.join(" · ")}</p>
        ) : (
          <p className="text-[12px] text-slate-400 mt-1">
            Not filled in yet -- add sales-cycle, work arrangement, and expectation details so recruiters have enough
            context for candidate conversations.
          </p>
        )}
        {(initial.expectation_3_month || initial.expectation_6_month || initial.expectation_1_year) && (
          <div className="mt-2 space-y-0.5">
            {initial.expectation_3_month && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">3mo:</span> {initial.expectation_3_month}
              </p>
            )}
            {initial.expectation_6_month && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">6mo:</span> {initial.expectation_6_month}
              </p>
            )}
            {initial.expectation_1_year && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-medium">1yr:</span> {initial.expectation_1_year}
              </p>
            )}
          </div>
        )}
        <p className="text-[10.5px] text-slate-400 mt-2 italic">Recruiter-only -- never shown on the public job listing.</p>
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
          <ClipboardList className="w-3.5 h-3.5 text-slate-400" /> Edit Gold Standard Brief
        </h2>
        <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

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
            <option value="">Typical sales cycle...</option>
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
          placeholder="Reports to (title)"
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
        placeholder="Company highlight links, comma-separated"
        value={form.company_highlight_links}
        onChange={(e) => setForm((f) => ({ ...f, company_highlight_links: e.target.value }))}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
      />

      <div>
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Preferred candidate industries (background)</p>
        <MultiSelectChips
          options={optionSets.industries}
          selected={form.preferred_industries}
          onChange={(next) => setForm((f) => ({ ...f, preferred_industries: next }))}
          placeholder="Search industries..."
        />
      </div>

      <div>
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Languages required</p>
        <MultiSelectChips
          options={optionSets.languages}
          selected={form.languages_required}
          onChange={(next) => setForm((f) => ({ ...f, languages_required: next }))}
          placeholder="Search languages..."
        />
      </div>

      <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 pt-1">Realistic expectations</p>
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

      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save"}
      </button>
      <p className="text-[11px] text-slate-400">Recruiter-only -- never shown on the public job listing.</p>
    </div>
  );
}
