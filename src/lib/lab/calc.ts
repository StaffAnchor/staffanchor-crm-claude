// Sales Leaders Lab: every calculated figure lives here as a pure function, so it can be tested on its own.
// Numbers match the Manager Toolkit workbook (Baseline & Endline, Cohort Roll-up, Forecast Tracker, Rep Banding).

export type MeasureKey = "follow_up_ontime" | "review_freq" | "call_quality" | "forecast_accuracy";

export const MEASURES: { key: MeasureKey; label: string; unit: string; hint: string; defaultDefinition: string; defaultSource: string; betterWhen: "higher" | "lower" }[] = [
  { key: "follow_up_ontime", label: "Follow-ups done on time", unit: "%", hint: "Plain number, for example 72 for 72%", defaultDefinition: "Dated next step completed by due date", defaultSource: "CRM task or activity view", betterWhen: "higher" },
  { key: "review_freq", label: "Review frequency", unit: "%", hint: "Reviews held vs planned, as a plain number", defaultDefinition: "One-on-ones and team reviews held as planned", defaultSource: "Calendar or review notes", betterWhen: "higher" },
  { key: "call_quality", label: "Call quality score", unit: "/100", hint: "Average of sampled calls, out of 100", defaultDefinition: "Average of sampled calls on the scorecard", defaultSource: "Call Quality Scorecard or your QA tool", betterWhen: "higher" },
  { key: "forecast_accuracy", label: "Forecast accuracy", unit: "%", hint: "Actual divided by month-start commit, as a plain number", defaultDefinition: "Actual divided by month-start commit", defaultSource: "Forecast Tracker", betterWhen: "higher" },
];

export type Result = "Improved" | "Slipped" | "No change";

export type Pair = { baseline: number | null; endline: number | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Change from baseline to endline; null until both are entered. */
export function change(p: Pair): number | null {
  const b = num(p.baseline), e = num(p.endline);
  return b == null || e == null ? null : Math.round((e - b) * 100) / 100;
}

export function resultOf(p: Pair, betterWhen: "higher" | "lower" = "higher"): Result | null {
  const c = change(p);
  if (c == null) return null;
  if (c === 0) return "No change";
  return (betterWhen === "higher" ? c > 0 : c < 0) ? "Improved" : "Slipped";
}

/** How many of the four measures improved for one manager (0 to 4). */
export function measuresImproved(row: Partial<Record<MeasureKey, Pair>>): number {
  return MEASURES.filter((m) => row[m.key] && resultOf(row[m.key]!, m.betterWhen) === "Improved").length;
}

export type RollupRow = { memberId: string; values: Partial<Record<MeasureKey, Pair>> };

/** Cohort roll-up: per-measure averages and movement, and how many managers improved on 3 or more measures. */
export function cohortRollup(rows: RollupRow[]) {
  const per = MEASURES.map((m) => {
    const b = rows.map((r) => num(r.values[m.key]?.baseline)).filter((x): x is number => x != null);
    const e = rows.map((r) => num(r.values[m.key]?.endline)).filter((x): x is number => x != null);
    const both = rows.filter((r) => num(r.values[m.key]?.baseline) != null && num(r.values[m.key]?.endline) != null);
    const avg = (a: number[]) => (a.length ? Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10 : null);
    const moves = both.map((r) => r.values[m.key]!.endline! - r.values[m.key]!.baseline!);
    return {
      key: m.key, label: m.label, unit: m.unit,
      baselineAvg: avg(b), endlineAvg: avg(e),
      avgMovement: moves.length ? Math.round((moves.reduce((s, x) => s + x, 0) / moves.length) * 10) / 10 : null,
      improved: both.filter((r) => resultOf(r.values[m.key]!, m.betterWhen) === "Improved").length,
      measured: both.length,
    };
  });
  const improvedCounts = rows.map((r) => measuresImproved(r.values));
  return { per, improvedCounts, improvingOn3Plus: improvedCounts.filter((n) => n >= 3).length };
}

/** Estimated annual cost of avoidable attrition: reps who left x replacement cost per rep. */
export const attritionCost = (reps: number | null, costPerRep: number | null): number | null => (reps == null || costPerRep == null ? null : reps * costPerRep);

// ---- Forecast Tracker ----
export const FORECAST_BAND = { low: 95, high: 105 };
export const forecastAccuracy = (commit: number, actual: number): number | null => (commit > 0 ? Math.round((actual / commit) * 100) : null);
export function forecastRead(acc: number | null, band = FORECAST_BAND): "Over-called" | "Accurate" | "Under-called" | null {
  if (acc == null) return null;
  return acc < band.low ? "Over-called" : acc > band.high ? "Under-called" : "Accurate";
}

// ---- Pipeline Audit (nine yes/no checks) ----
export const AUDIT_CHECKS = [
  "Stage matches buyer action", "Dated next step", "Decision maker known", "Need confirmed", "Last contact within cadence",
  "Competition or alternative known", "Close date has a reason", "Value agreed with buyer", "Realistic stage age",
];
export const auditScore = (answers: (boolean | null)[]): number => answers.filter((a) => a === true).length;

// ---- Follow-up check ----
export const onTimePct = (sampled: number, withNextStep: number): number | null => (sampled > 0 ? Math.round((withNextStep / sampled) * 100) : null);

// ---- Call Quality Scorecard ----
export const SCORECARD_DEFAULT: { key: string; label: string; weight: number }[] = [
  { key: "opening", label: "Opening and agenda", weight: 10 },
  { key: "discovery", label: "Discovery questions", weight: 20 },
  { key: "listening", label: "Listening and talk ratio", weight: 15 },
  { key: "objections", label: "Handling objections", weight: 15 },
  { key: "value", label: "Value and fit, not features", weight: 15 },
  { key: "next_step", label: "Next step agreed and dated", weight: 15 },
  { key: "compliance", label: "Compliance and tone", weight: 10 },
];
/** Weighted score out of 100: sum(weight x rating) / 5 when the weights add to 100. Ratings are 1 to 5. */
export function weightedScore(ratings: Record<string, number | null>, weights = SCORECARD_DEFAULT): number | null {
  let total = 0, w = 0;
  for (const c of weights) {
    const r = ratings[c.key];
    if (r == null || r < 1 || r > 5) return null;
    total += c.weight * r;
    w += c.weight;
  }
  return w > 0 ? Math.round((total / (5 * w)) * 1000) / 10 : null;
}

// ---- Calibration ----
export function calibration(a: Record<string, number | null>, b: Record<string, number | null>, keys = SCORECARD_DEFAULT.map((c) => c.key)) {
  const gaps = keys.map((k) => (a[k] != null && b[k] != null ? Math.abs(a[k]! - b[k]!) : null));
  const known = gaps.filter((g): g is number => g != null);
  return { gaps, bigGaps: known.filter((g) => g >= 2).length, avgGap: known.length ? Math.round((known.reduce((s, g) => s + g, 0) / known.length) * 10) / 10 : null };
}

// ---- Rep Banding ----
export const BAND_DEFAULT = { rampUpTo: 3, developingUpTo: 12 };
export const bandOf = (tenureMonths: number, b = BAND_DEFAULT): "Ramp up" | "Developing" | "Established" => (tenureMonths <= b.rampUpTo ? "Ramp up" : tenureMonths <= b.developingUpTo ? "Developing" : "Established");
export function bandingFocus(pctOfBandAverage: number | null): string | null {
  if (pctOfBandAverage == null) return null;
  return pctOfBandAverage < 80 ? "Diagnose: skill, will or system" : pctOfBandAverage > 120 ? "Learn from them and retain them" : "In band: stretch";
}

// ---- One-on-one commitments ----
export const doneOnTimePct = (flags: boolean[]): number | null => (flags.length ? Math.round((flags.filter(Boolean).length / flags.length) * 100) : null);

// ---- Programme progress (shown to participants, sales heads and management) ----
export type ProgressInput = { profileDone: boolean; baselineEntered: number; endlineEntered: number; sessionsHeld: number; attended: number; assignmentsDone: number };
export const PROGRESS_WEIGHTS = { profile: 10, baseline: 25, attendance: 25, assignments: 20, endline: 20 };
/** Programme progress, 0 to 100. Attendance and assignments are measured against sessions held so far. */
export function progressPct(p: ProgressInput): number {
  const w = PROGRESS_WEIGHTS;
  const total = MEASURES.length;
  const parts =
    (p.profileDone ? w.profile : 0) +
    w.baseline * Math.min(1, p.baselineEntered / total) +
    (p.sessionsHeld > 0 ? w.attendance * Math.min(1, p.attended / p.sessionsHeld) : 0) +
    (p.sessionsHeld > 0 ? w.assignments * Math.min(1, p.assignmentsDone / p.sessionsHeld) : 0) +
    w.endline * Math.min(1, p.endlineEntered / total);
  return Math.round(parts);
}
