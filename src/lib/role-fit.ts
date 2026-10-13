import { dealSizeBandsB2B, salesCycleOptions } from "@/lib/candidate-options";
import type { PassportRow } from "@/lib/saas-passport";

// "Find for a role": the filters a B2B sales mandate turns on, checked one by one against each candidate
// on the bench. Nothing here is AI: every result says which requirement it passes, which it misses and
// which it cannot tell yet because the profile has no answer.

export type RoleOption = {
  id: string;
  title: string;
  client: string | null;
  status: string;
  cities: string[];
  expMin: number | null;
  expMax: number | null;
  budgetMax: number | null;
  dealBand: string | null;
  cycle: string | null;
};

export type RoleFilters = {
  cities: string;
  relocate: boolean;
  expMin: string;
  expMax: string;
  ctcMax: string;
  noticeMax: string;
  deal: string;
  cycle: string;
  hunter: string;
  ready: "any" | "ready" | "ready_almost";
};

export const EMPTY_FILTERS: RoleFilters = {
  cities: "",
  relocate: true,
  expMin: "",
  expMax: "",
  ctcMax: "",
  noticeMax: "",
  deal: "",
  cycle: "",
  hunter: "",
  ready: "any",
};

export function filtersFromRole(r: RoleOption): RoleFilters {
  return {
    ...EMPTY_FILTERS,
    cities: r.cities.join(", "),
    expMin: r.expMin != null ? String(r.expMin) : "",
    expMax: r.expMax != null ? String(r.expMax) : "",
    ctcMax: r.budgetMax != null ? String(r.budgetMax) : "",
    deal: r.dealBand ?? "",
    cycle: r.cycle ?? "",
  };
}

export type CheckState = "pass" | "fail" | "unknown";
export type Check = { key: string; label: string; state: CheckState; detail: string };

// Delhi and its satellite cities are one hiring market for most roles.
const NCR = new Set(["delhi", "new delhi", "noida", "greater noida", "gurgaon", "gurugram", "ghaziabad", "faridabad", "ncr", "delhi ncr"]);

const norm = (s: string) => s.trim().toLowerCase();

function cityMatches(candidateCity: string, wanted: string[]): boolean {
  const c = norm(candidateCity);
  return wanted.some((w) => {
    const x = norm(w);
    if (!x) return false;
    if (c === x || c.includes(x) || x.includes(c)) return true;
    return NCR.has(c) && NCR.has(x);
  });
}

const INR = dealSizeBandsB2B.INR;
const USD = dealSizeBandsB2B.USD;

function bandIndex(band: string): { list: "INR" | "USD"; i: number } | null {
  const a = INR.indexOf(band);
  if (a >= 0) return { list: "INR", i: a };
  const b = USD.indexOf(band);
  if (b >= 0) return { list: "USD", i: b };
  return null;
}

const num = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
};

export function evaluate(r: PassportRow, f: RoleFilters, relocation: string | null): Check[] {
  const out: Check[] = [];

  const wantedCities = f.cities.split(",").map((s) => s.trim()).filter(Boolean);
  if (wantedCities.length > 0) {
    if (!r.city) out.push({ key: "city", label: "City", state: "unknown", detail: "City not on the profile" });
    else if (cityMatches(r.city, wantedCities)) out.push({ key: "city", label: "City", state: "pass", detail: r.city });
    else if (f.relocate && relocation === "Yes") out.push({ key: "city", label: "City", state: "pass", detail: `${r.city}, open to relocate` });
    else if (f.relocate && (relocation === "Maybe" || relocation === "Depends upon Option")) out.push({ key: "city", label: "City", state: "unknown", detail: `${r.city}, might relocate` });
    else out.push({ key: "city", label: "City", state: "fail", detail: r.city });
  }

  const expMin = num(f.expMin);
  const expMax = num(f.expMax);
  if (expMin != null || expMax != null) {
    const y = r.total_experience_years != null ? Number(r.total_experience_years) : null;
    const want = `${expMin ?? 0}${expMax != null ? `-${expMax}` : "+"} yrs`;
    if (y == null || !Number.isFinite(y)) out.push({ key: "exp", label: "Experience", state: "unknown", detail: "Experience not known" });
    else if ((expMin != null && y < expMin) || (expMax != null && y > expMax)) out.push({ key: "exp", label: "Experience", state: "fail", detail: `${y} yrs, wants ${want}` });
    else out.push({ key: "exp", label: "Experience", state: "pass", detail: `${y} yrs` });
  }

  const ctcMax = num(f.ctcMax);
  if (ctcMax != null) {
    const c = r.current_fixed_ctc != null ? Number(r.current_fixed_ctc) : null;
    if (c == null || !Number.isFinite(c)) out.push({ key: "ctc", label: "CTC", state: "unknown", detail: "Current CTC not known" });
    else if (c > ctcMax) out.push({ key: "ctc", label: "CTC", state: "fail", detail: `${c} LPA, budget ${ctcMax}` });
    else out.push({ key: "ctc", label: "CTC", state: "pass", detail: `${c} LPA` });
  }

  const noticeMax = num(f.noticeMax);
  if (noticeMax != null) {
    if (r.notice_days_est == null) out.push({ key: "notice", label: "Notice", state: "unknown", detail: "Notice not known" });
    else if (r.notice_days_est > noticeMax) out.push({ key: "notice", label: "Notice", state: "fail", detail: `${r.notice_days_est} days` });
    else out.push({ key: "notice", label: "Notice", state: "pass", detail: `${r.notice_days_est} days` });
  }

  if (f.deal) {
    const want = bandIndex(f.deal);
    const have = r.deal_size ? bandIndex(r.deal_size) : null;
    if (!r.deal_size) out.push({ key: "deal", label: "Deal size", state: "unknown", detail: "Deal size not known" });
    else if (!want || !have || want.list !== have.list) out.push({ key: "deal", label: "Deal size", state: "unknown", detail: `${r.deal_size}, not comparable to ${f.deal}` });
    else if (have.i >= want.i) out.push({ key: "deal", label: "Deal size", state: "pass", detail: `${r.deal_size}` });
    else out.push({ key: "deal", label: "Deal size", state: "fail", detail: `${r.deal_size}, role is ${f.deal}` });
  }

  if (f.cycle) {
    const want = salesCycleOptions.indexOf(f.cycle);
    const have = r.sales_cycle ? salesCycleOptions.indexOf(r.sales_cycle) : -1;
    if (!r.sales_cycle) out.push({ key: "cycle", label: "Sales cycle", state: "unknown", detail: "Cycle not known" });
    else if (want < 0 || have < 0) out.push({ key: "cycle", label: "Sales cycle", state: "unknown", detail: `${r.sales_cycle}` });
    else if (have >= want) out.push({ key: "cycle", label: "Sales cycle", state: "pass", detail: `${r.sales_cycle}` });
    else out.push({ key: "cycle", label: "Sales cycle", state: "fail", detail: `${r.sales_cycle}, role is ${f.cycle}` });
  }

  if (f.hunter) {
    if (!r.hunter_farmer) out.push({ key: "style", label: "Hunter or farmer", state: "unknown", detail: "Style not known" });
    else if (r.hunter_farmer === f.hunter || r.hunter_farmer === "both") out.push({ key: "style", label: "Hunter or farmer", state: "pass", detail: r.hunter_farmer });
    else out.push({ key: "style", label: "Hunter or farmer", state: "fail", detail: r.hunter_farmer });
  }

  if (f.ready !== "any") {
    const ok = f.ready === "ready" ? r.readiness_tier === "ready" : r.readiness_tier === "ready" || r.readiness_tier === "almost";
    out.push({ key: "ready", label: "Readiness", state: ok ? "pass" : "fail", detail: r.readiness_tier ?? "unknown" });
  }

  return out;
}

/** The active requirements in plain words, kept with a saved shortlist so it is clear how it was made. */
export function describeFilters(role: RoleOption | null, f: RoleFilters): string {
  const parts: string[] = [];
  const cities = f.cities.split(",").map((s) => s.trim()).filter(Boolean);
  if (cities.length) parts.push(`cities ${cities.join(", ")}${f.relocate ? " (or open to relocate)" : ""}`);
  const lo = num(f.expMin);
  const hi = num(f.expMax);
  if (lo != null || hi != null) parts.push(`experience ${lo ?? 0}${hi != null ? `-${hi}` : "+"} years`);
  if (num(f.ctcMax) != null) parts.push(`current CTC up to ${f.ctcMax} LPA`);
  if (num(f.noticeMax) != null) parts.push(`notice up to ${f.noticeMax} days`);
  if (f.deal) parts.push(`deal size ${f.deal} or more`);
  if (f.cycle) parts.push(`sales cycle ${f.cycle} or longer`);
  if (f.hunter) parts.push(f.hunter === "hunter" ? "hunter" : "farmer");
  if (f.ready !== "any") parts.push(f.ready === "ready" ? "ready to shortlist" : "ready or almost ready");
  const head = role ? `Made from the B2B SaaS bench for "${role.title}"` : "Made from the B2B SaaS bench";
  return parts.length ? `${head}. Requirements: ${parts.join("; ")}.` : `${head}.`;
}
