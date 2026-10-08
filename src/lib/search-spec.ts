// What a recruiter's search asks for, split into hard constraints we can check with data
// (city, experience, CTC, notice) and qualitative asks we need to read a CV to judge.
// Everything here is plain code: the same candidate and the same ask always give the same answer.

export interface SearchSpec {
  cities: string[];
  min_exp: number | null;
  max_exp: number | null;
  /** lakhs per year */
  max_expected_ctc: number | null;
  max_current_ctc: number | null;
  max_notice_days: number | null;
  /** things a CV has to show, e.g. "hunter, not farmer" or "B2B SaaS" */
  must: string[];
  /** nice to have */
  nice: string[];
}

export const emptySpec = (): SearchSpec => ({ cities: [], min_exp: null, max_exp: null, max_expected_ctc: null, max_current_ctc: null, max_notice_days: null, must: [], nice: [] });

export type CheckStatus = "met" | "near" | "unknown" | "not_met";
export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  evidence: string;
}

export interface CandidateFacts {
  current_location?: string | null;
  open_to_relocation?: string | null;
  total_experience_years?: number | string | null;
  expected_fixed_ctc?: number | string | null;
  current_fixed_ctc?: number | string | null;
  notice_period?: string | null;
}

/** "Immediate" is 0, "30 days" is 30, "2 months" is 60, "90+ days" is 90. Unknown text is null. */
export function noticeDays(raw: string | null | undefined): number | null {
  const t = (raw ?? "").toLowerCase().trim();
  if (!t) return null;
  if (/immediate|joined|available now|serving.*0/.test(t)) return 0;
  const days = t.match(/(\d+)\s*\+?\s*(?:days?|d)\b/);
  if (days) return parseInt(days[1], 10);
  const months = t.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:months?|mos?)\b/);
  if (months) return Math.round(parseFloat(months[1]) * 30);
  const weeks = t.match(/(\d+)\s*weeks?\b/);
  if (weeks) return parseInt(weeks[1], 10) * 7;
  return null;
}

const ALIASES: string[][] = [
  ["bangalore", "bengaluru", "bangaluru"],
  ["gurgaon", "gurugram"],
  ["mumbai", "bombay"],
  ["kolkata", "calcutta"],
  ["chennai", "madras"],
  ["pune", "poona"],
];
const NCR = ["delhi", "new delhi", "noida", "greater noida", "gurgaon", "gurugram", "ghaziabad", "faridabad", "ncr", "delhi ncr"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
const variants = (city: string): string[] => {
  const c = norm(city);
  const group = ALIASES.find((g) => g.includes(c));
  return group ?? [c];
};
const inNcr = (s: string) => NCR.some((n) => norm(s).includes(n));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

/** Cities that mean "no place constraint". */
const ANYWHERE = new Set(["remote", "anywhere", "any", "pan india", "india", "work from home", "wfh"]);

export function evaluateConstraints(c: CandidateFacts, spec: SearchSpec): Check[] {
  const out: Check[] = [];

  const cities = spec.cities.filter((x) => x && !ANYWHERE.has(norm(x)));
  if (cities.length) {
    const loc = (c.current_location ?? "").trim();
    const label = `Based in ${cities.join(" / ")}`;
    if (!loc) out.push({ key: "city", label, status: "unknown", evidence: "City not on file" });
    else {
      const l = norm(loc);
      const hit = cities.find((city) => variants(city).some((v) => l.includes(v)));
      if (hit) out.push({ key: "city", label, status: "met", evidence: loc });
      else {
        const reloc = (c.open_to_relocation ?? "").toLowerCase();
        const ncrNear = cities.some((city) => inNcr(city)) && inNcr(loc);
        if (ncrNear) out.push({ key: "city", label, status: "near", evidence: `${loc} (same NCR region)` });
        else if (/^(yes|maybe|depend)/.test(reloc)) out.push({ key: "city", label, status: "near", evidence: `${loc}, open to relocation (${c.open_to_relocation})` });
        else out.push({ key: "city", label, status: "not_met", evidence: reloc.startsWith("no") ? `${loc}, not open to relocation` : `${loc}, relocation not stated` });
      }
    }
  }

  if (spec.min_exp !== null || spec.max_exp !== null) {
    const years = num(c.total_experience_years);
    const lo = spec.min_exp;
    const hi = spec.max_exp;
    const label = lo !== null && hi !== null ? `${lo}-${hi} years experience` : lo !== null ? `${lo}+ years experience` : `Up to ${hi} years experience`;
    if (years === null) out.push({ key: "experience", label, status: "unknown", evidence: "Experience not on file" });
    else if ((lo === null || years >= lo) && (hi === null || years <= hi)) out.push({ key: "experience", label, status: "met", evidence: `${years} years` });
    else if (lo !== null && years < lo) out.push({ key: "experience", label, status: years >= lo - 1 ? "near" : "not_met", evidence: `${years} years, below ${lo}` });
    else out.push({ key: "experience", label, status: years <= (hi as number) + 2 ? "near" : "not_met", evidence: `${years} years, above ${hi}` });
  }

  const ctcCheck = (key: "expected_ctc" | "current_ctc", cap: number | null, value: unknown, noun: string) => {
    if (cap === null) return;
    const label = `${noun} up to ${cap} LPA`;
    const v = num(value);
    if (v === null) out.push({ key, label, status: "unknown", evidence: `${noun} not on file` });
    else if (v <= cap) out.push({ key, label, status: "met", evidence: `${v} LPA` });
    else if (v <= cap * 1.15) out.push({ key, label, status: "near", evidence: `${v} LPA, slightly above` });
    else out.push({ key, label, status: "not_met", evidence: `${v} LPA, above ${cap}` });
  };
  ctcCheck("expected_ctc", spec.max_expected_ctc, c.expected_fixed_ctc, "Expected CTC");
  ctcCheck("current_ctc", spec.max_current_ctc, c.current_fixed_ctc, "Current CTC");

  if (spec.max_notice_days !== null) {
    const label = spec.max_notice_days === 0 ? "Immediate joiner" : `Notice up to ${spec.max_notice_days} days`;
    const d = noticeDays(c.notice_period);
    if (d === null) out.push({ key: "notice", label, status: "unknown", evidence: "Notice period not on file" });
    else if (d <= spec.max_notice_days) out.push({ key: "notice", label, status: "met", evidence: c.notice_period ?? `${d} days` });
    else out.push({ key: "notice", label, status: "not_met", evidence: `${c.notice_period}, longer than ${spec.max_notice_days} days` });
  }
  return out;
}

/** Clean a spec that came from the AI or from the browser: right types, sane ranges, no duplicates. */
export function sanitizeSpec(raw: unknown): SearchSpec {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const strs = (v: unknown, max: number) => (Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && x.trim().length > 1).map((x) => x.trim().slice(0, 80)))).slice(0, max) : []);
  const n = (v: unknown, lo: number, hi: number) => {
    const x = num(v);
    return x !== null && x >= lo && x <= hi ? x : null;
  };
  const spec: SearchSpec = {
    cities: strs(r.cities, 8),
    min_exp: n(r.min_exp, 0, 50),
    max_exp: n(r.max_exp, 0, 50),
    max_expected_ctc: n(r.max_expected_ctc, 0.5, 500),
    max_current_ctc: n(r.max_current_ctc, 0.5, 500),
    max_notice_days: n(r.max_notice_days, 0, 365),
    must: strs(r.must, 6),
    nice: strs(r.nice, 6),
  };
  if (spec.min_exp !== null && spec.max_exp !== null && spec.min_exp > spec.max_exp) [spec.min_exp, spec.max_exp] = [spec.max_exp, spec.min_exp];
  return spec;
}

export const hasConstraints = (s: SearchSpec) =>
  s.cities.length > 0 || s.min_exp !== null || s.max_exp !== null || s.max_expected_ctc !== null || s.max_current_ctc !== null || s.max_notice_days !== null;
