// Shared by the referrer portal and the admin Sales Circle screens.
//
// Units: a role's budget_min / budget_max and a candidate's expected CTC are
// stored in LAKHS per annum (6.5 means ₹6.5 lakh). Payout slabs are stored in
// RUPEES. Never divide a budget by 100000: that is what showed "₹0.0L".

/** "₹5–8 LPA", "up to ₹8 LPA", "from ₹5 LPA", or null when there is no budget. */
export function ctcBand(min: number | string | null | undefined, max: number | string | null | undefined): string | null {
  const lo = min == null || min === "" ? null : Number(min);
  const hi = max == null || max === "" ? null : Number(max);
  const f = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, "")}`;
  if (lo && hi && lo !== hi) return `₹${f(lo)}–${f(hi)} LPA`;
  if (hi) return lo && lo === hi ? `₹${f(hi)} LPA` : `up to ₹${f(hi)} LPA`;
  if (lo) return `from ₹${f(lo)} LPA`;
  return null;
}

/** A single lakh figure, e.g. a candidate's expected CTC: "₹12 LPA". */
export function lpa(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `₹${Number.isInteger(v) ? v : v.toFixed(1).replace(/\.0$/, "")} LPA`;
}

export function experienceBand(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min != null && max != null && min !== max) return `${min}–${max} yrs`;
  if (max != null) return min != null ? `${max} yrs` : `up to ${max} yrs`;
  if (min != null) return `${min}+ yrs`;
  return null;
}

export const inr = (n: number | string | null | undefined): string => (n == null || n === "" ? "—" : `₹${Number(n).toLocaleString("en-IN")}`);

export const CATEGORY_LABEL: Record<string, string> = { b2b_sales: "B2B Sales", b2c_sales: "B2C Sales", non_sales: "Non-sales" };
export const categoryLabel = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c.replace(/_/g, " ") : null);

/** The only fields a referrer is ever shown about a role. No client name, no job description. */
export type RoleCardData = {
  id: string;
  role_title: string;
  category: string | null;
  sub_domain: string | null;
  city: string | null;
  cities: string[] | null;
  work_mode: string | null;
  working_days: string | null;
  week_off: string[] | null;
  shift_timing: string | null;
  experience_min: number | null;
  experience_max: number | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  team_size_band: string | null;
  company_size_band: string | null;
  team_handling: string | null;
  sales_cycle: string | null;
  deal_size_currency: string | null;
  deal_size_band: string | null;
  selling_style: string | null;
  languages_required: string[] | null;
  industries_sold_to: string[] | null;
  seniority_band: string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  referral_summary: string | null;
  created_at: string;
  company_name: string | null;
  payout_amount: number | string | null;
  my_referral_count?: number;
};

const SENIORITY_LABEL: Record<string, string> = {
  ic: "Individual contributor",
  team_lead: "Team lead",
  manager: "Manager",
  director: "Director",
  vp_plus: "VP and above",
};

const nice = (v: string) => v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function locationText(r: Pick<RoleCardData, "city" | "cities">): string | null {
  const list = (r.cities ?? []).filter(Boolean);
  if (list.length > 1) return list.join(" / ");
  return r.city || list[0] || null;
}

/** The facts shown on a role card. Only ones that exist; the two core ones say "To be confirmed" when missing. */
export function roleFacts(r: RoleCardData): { label: string; value: string; muted?: boolean }[] {
  const out: { label: string; value: string; muted?: boolean }[] = [];
  const ctc = ctcBand(r.budget_min, r.budget_max);
  out.push(ctc ? { label: "Fixed CTC", value: ctc } : { label: "Fixed CTC", value: "To be confirmed", muted: true });
  const exp = experienceBand(r.experience_min, r.experience_max);
  out.push(exp ? { label: "Experience", value: exp } : { label: "Experience", value: "To be confirmed", muted: true });
  const add = (label: string, value: string | null | undefined) => {
    if (value && String(value).trim()) out.push({ label, value: String(value) });
  };
  add("Work mode", r.work_mode ? nice(r.work_mode) : null);
  add("Working days", r.working_days);
  add("Weekly off", r.week_off && r.week_off.length ? r.week_off.join(", ") : null);
  add("Shift", r.shift_timing);
  add("Seniority", r.seniority_band ? SENIORITY_LABEL[r.seniority_band] ?? nice(r.seniority_band) : null);
  add("Team", r.team_handling || r.team_size_band);
  add("Company size", r.company_size_band);
  add("Sales cycle", r.sales_cycle);
  add("Typical deal", [r.deal_size_currency, r.deal_size_band].filter(Boolean).join(" "));
  add("Selling style", r.selling_style ? nice(r.selling_style) : null);
  add("Sells to", r.industries_sold_to && r.industries_sold_to.length ? r.industries_sold_to.slice(0, 4).join(", ") : null);
  add("Languages", r.languages_required && r.languages_required.length ? r.languages_required.join(", ") : null);
  return out;
}

/** What an admin must fill in before a role reads well to referrers. */
export type ReadinessInput = {
  budget_min: unknown;
  budget_max: unknown;
  experience_min: unknown;
  experience_max: unknown;
  city: unknown;
  cities?: unknown;
  work_mode: unknown;
  must_haves: unknown;
  referral_summary: unknown;
  sub_domain?: unknown;
  team_size_band?: unknown;
  company_size_band?: unknown;
  working_days?: unknown;
  shift_timing?: unknown;
  sales_cycle?: unknown;
};

const has = (v: unknown) => (Array.isArray(v) ? v.length > 0 : v != null && String(v).trim() !== "" && String(v) !== "0");

export function roleReadiness(m: ReadinessInput) {
  const core: [string, boolean][] = [
    ["CTC budget", has(m.budget_max) || has(m.budget_min)],
    ["Experience range", has(m.experience_min) || has(m.experience_max)],
    ["Location", has(m.city) || has(m.cities)],
    ["Work mode", has(m.work_mode)],
    ["Must-have requirements", has(m.must_haves)],
    ["Referrer summary", has(m.referral_summary)],
  ];
  const extra: [string, boolean][] = [
    ["Sector", has(m.sub_domain)],
    ["Team size", has(m.team_size_band)],
    ["Company size", has(m.company_size_band)],
    ["Working days", has(m.working_days)],
    ["Shift", has(m.shift_timing)],
    ["Sales cycle", has(m.sales_cycle)],
  ];
  const missingCore = core.filter(([, ok]) => !ok).map(([l]) => l);
  const missingExtra = extra.filter(([, ok]) => !ok).map(([l]) => l);
  const total = core.length + extra.length;
  const done = total - missingCore.length - missingExtra.length;
  return { missingCore, missingExtra, percent: Math.round((done / total) * 100), ready: missingCore.length === 0 };
}

export type PayoutSlab = { ctc_band_min: number | string; ctc_band_max: number | string | null; payout_amount: number | string; active: boolean };

/** Payout for a role, from its budget in LAKHS and slabs in RUPEES. Same rule the database uses. */
export function slabPayout(budgetLakhs: number | string | null | undefined, slabs: PayoutSlab[]): number | null {
  if (budgetLakhs == null || budgetLakhs === "") return null;
  const rupees = Number(budgetLakhs) * 100000;
  const hit = slabs
    .filter((s) => s.active && rupees >= Number(s.ctc_band_min) && (s.ctc_band_max == null || rupees < Number(s.ctc_band_max)))
    .sort((a, b) => Number(b.ctc_band_min) - Number(a.ctc_band_min))[0];
  return hit ? Number(hit.payout_amount) : null;
}
