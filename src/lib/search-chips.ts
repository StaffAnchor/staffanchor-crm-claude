import type { SearchSpec } from "@/lib/search-spec";

// How a search is shown back to the recruiter: one chip per thing it asks for, each removable to widen the search.
export type Chip = { id: string; text: string; kind: "hard" | "must" | "nice"; remove: (s: SearchSpec) => SearchSpec };

export function chipsOf(spec: SearchSpec): Chip[] {
  const out: Chip[] = [];
  spec.cities.forEach((c) => out.push({ id: `city:${c}`, text: c, kind: "hard", remove: (s) => ({ ...s, cities: s.cities.filter((x) => x !== c) }) }));
  if (spec.min_exp !== null || spec.max_exp !== null) {
    const t = spec.min_exp !== null && spec.max_exp !== null ? `${spec.min_exp}–${spec.max_exp} yrs` : spec.min_exp !== null ? `${spec.min_exp}+ yrs` : `up to ${spec.max_exp} yrs`;
    out.push({ id: "exp", text: t, kind: "hard", remove: (s) => ({ ...s, min_exp: null, max_exp: null }) });
  }
  if (spec.max_expected_ctc !== null) out.push({ id: "ectc", text: `Expected ≤ ${spec.max_expected_ctc} LPA`, kind: "hard", remove: (s) => ({ ...s, max_expected_ctc: null }) });
  if (spec.max_current_ctc !== null) out.push({ id: "cctc", text: `Current ≤ ${spec.max_current_ctc} LPA`, kind: "hard", remove: (s) => ({ ...s, max_current_ctc: null }) });
  if (spec.max_notice_days !== null) out.push({ id: "notice", text: spec.max_notice_days === 0 ? "Immediate joiner" : `Notice ≤ ${spec.max_notice_days} days`, kind: "hard", remove: (s) => ({ ...s, max_notice_days: null }) });
  spec.must.forEach((m) => out.push({ id: `must:${m}`, text: m, kind: "must", remove: (s) => ({ ...s, must: s.must.filter((x) => x !== m) }) }));
  spec.nice.forEach((m) => out.push({ id: `nice:${m}`, text: `${m} (nice to have)`, kind: "nice", remove: (s) => ({ ...s, nice: s.nice.filter((x) => x !== m) }) }));
  return out;
}

export const CHIP_CLS = {
  hard: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800",
  must: "bg-teal-50 text-teal-800 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-200 dark:ring-teal-800",
  nice: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

