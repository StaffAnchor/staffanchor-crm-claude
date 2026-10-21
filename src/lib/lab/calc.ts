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

export type Band = { low: number; high: number };
/** The cohort's accuracy band: 95 to 105 unless the facilitator set another for this cohort. */
export function bandFor(config: Record<string, unknown> | null | undefined): Band {
  const b = (config?.forecast_band ?? {}) as Record<string, unknown>;
  const low = typeof b.low === "number" ? b.low : FORECAST_BAND.low;
  const high = typeof b.high === "number" ? b.high : FORECAST_BAND.high;
  return low > 0 && high >= low ? { low, high } : FORECAST_BAND;
}

export type ForecastMonth = { month: string; commit: number | null; bestCase?: number | null; actual: number | null };
/** One manager's forecast record: average accuracy, months inside the band, and whether they tend to over- or under-call. */
export function forecastSummary(months: ForecastMonth[], band: Band = FORECAST_BAND) {
  const rows = months
    .map((m) => ({ ...m, accuracy: m.commit != null && m.actual != null ? forecastAccuracy(m.commit, m.actual) : null }))
    .map((m) => ({ ...m, read: forecastRead(m.accuracy, band) }));
  const done = rows.filter((r) => r.accuracy != null);
  return {
    rows,
    months: done.length,
    avgAccuracy: done.length ? Math.round(done.reduce((s2, r) => s2 + (r.accuracy as number), 0) / done.length) : null,
    withinBand: done.filter((r) => r.read === "Accurate").length,
    over: done.filter((r) => r.read === "Over-called").length,
    under: done.filter((r) => r.read === "Under-called").length,
  };
}

export type RootCause = "skill" | "will" | "system" | "unclear";
export const ROOT_CAUSES: { key: RootCause; label: string; hint: string }[] = [
  { key: "skill", label: "Skill", hint: "They do not know how" },
  { key: "will", label: "Will", hint: "They know but do not want to" },
  { key: "system", label: "System", hint: "The process, tool or target gets in the way. Fix this first" },
  { key: "unclear", label: "Not sure yet", hint: "Find out before acting" },
];
export const REVIEW_QUESTIONS = [
  "What has changed on this deal since last week?",
  "What is the buyer's next step, and by when?",
  "Who else is involved in the decision?",
  "What is the one thing that could stop this closing?",
  "What do you need from me this week?",
];

export type ReviewPrep = { rootCause: RootCause | null; actionLogged: boolean | null; followUpOn?: string | null; followedUp?: boolean };
/** One manager's review preparation: how many, how many actions were logged in the company system, the root-cause mix, and follow-through. */
export function reviewSummary(rows: ReviewPrep[], today = new Date().toISOString().slice(0, 10)) {
  const logged = rows.filter((r) => r.actionLogged != null);
  const withFollowUp = rows.filter((r) => r.followUpOn);
  return {
    total: rows.length,
    actionLoggedPct: logged.length ? Math.round((logged.filter((r) => r.actionLogged === true).length / logged.length) * 100) : null,
    causes: { skill: rows.filter((r) => r.rootCause === "skill").length, will: rows.filter((r) => r.rootCause === "will").length, system: rows.filter((r) => r.rootCause === "system").length, unclear: rows.filter((r) => r.rootCause === "unclear").length },
    followUps: withFollowUp.length,
    followedUp: withFollowUp.filter((r) => r.followedUp).length,
    overdue: withFollowUp.filter((r) => !r.followedUp && (r.followUpOn as string) < today).length,
  };
}

export type CoachingPrep = { repRef: string; gap: RootCause | null; followUpOn?: string | null; followedUp?: boolean };
/** One manager's coaching: conversations, reps coached, the skill / will / system mix, and whether follow-ups happened. */
export function coachingSummary(rows: CoachingPrep[], today = new Date().toISOString().slice(0, 10)) {
  const withFollowUp = rows.filter((r) => r.followUpOn);
  const gaps = rows.filter((r) => r.gap != null);
  return {
    total: rows.length,
    reps: new Set(rows.map((r) => r.repRef.trim().toLowerCase()).filter(Boolean)).size,
    gaps: { skill: rows.filter((r) => r.gap === "skill").length, will: rows.filter((r) => r.gap === "will").length, system: rows.filter((r) => r.gap === "system").length, unclear: rows.filter((r) => r.gap === "unclear").length },
    systemSharePct: gaps.length ? Math.round((rows.filter((r) => r.gap === "system").length / gaps.length) * 100) : null,
    followUps: withFollowUp.length,
    followedUp: withFollowUp.filter((r) => r.followedUp).length,
    overdue: withFollowUp.filter((r) => !r.followedUp && (r.followUpOn as string) < today).length,
  };
}

export const ONE_ON_ONE_SEGMENTS: { key: string; minutes: string; label: string; what: string }[] = [
  { key: "open", minutes: "0-5", label: "Open", what: "Ask how the week went. Listen. Do not start with numbers." },
  { key: "theirs", minutes: "5-12", label: "Their agenda", what: "The rep chooses the topic. Note what they raise first." },
  { key: "performance", minutes: "12-22", label: "Performance and one deal", what: "Review one deal or call using facts. Ask, then tell." },
  { key: "coaching", minutes: "22-27", label: "Coaching", what: "Agree one behaviour to practise. Use skill, will or system to decide the help." },
  { key: "commit", minutes: "27-30", label: "Commit", what: "The rep states the commitment and the date. You note your own follow-up." },
];

export type OneOnOne = { repRef: string; commitment?: string | null; dueOn?: string | null; done?: boolean | null };
/** One manager's one-on-ones: how many, reps covered, and the share of commitments done by the agreed date. */
export function oneOnOneSummary(rows: OneOnOne[], today = new Date().toISOString().slice(0, 10)) {
  const made = rows.filter((r) => (r.commitment ?? "").trim());
  const answered = made.filter((r) => r.done === true || r.done === false);
  return {
    total: rows.length,
    reps: new Set(rows.map((r) => r.repRef.trim().toLowerCase()).filter(Boolean)).size,
    commitments: made.length,
    answered: answered.length,
    doneOnTimePct: doneOnTimePct(answered.map((r) => r.done === true)),
    overdueOpen: made.filter((r) => r.done == null && r.dueOn && r.dueOn < today).length,
  };
}

export const PLAN_DAYS = [10, 20, 30] as const;
export type ReviewStatus = "on_track" | "at_risk" | "off_track";
export type PlanReview = { day: number; due: string; done: boolean; status: ReviewStatus | null };
export type PlanOutcome = "open" | "met" | "not_met" | "closed";
export const PLAN_OUTCOMES: { key: PlanOutcome; label: string }[] = [
  { key: "open", label: "Open" }, { key: "met", label: "Standard met" }, { key: "not_met", label: "Standard not met" }, { key: "closed", label: "Closed for another reason" },
];

/** The date `days` after `from` (both as YYYY-MM-DD, in plain calendar days). */
export function addDaysIso(from: string, days: number): string {
  const d = new Date(`${from}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** The three review checkpoints of a 30-day plan: day 10, day 20 and day 30. */
export const reviewsFor = (startedOn: string): PlanReview[] => PLAN_DAYS.map((day) => ({ day, due: addDaysIso(startedOn, day), done: false, status: null }));

export type PlanIn = { outcome: PlanOutcome; reviews: PlanReview[] };
/** One manager's performance plans, as counts only: how many, how they ended, and whether reviews happen on time. */
export function planSummary(plans: PlanIn[], today = new Date().toISOString().slice(0, 10)) {
  const open = plans.filter((p) => p.outcome === "open");
  const reviewsDue = plans.flatMap((p) => p.reviews).filter((r) => r.due <= today);
  return {
    total: plans.length,
    open: open.length,
    met: plans.filter((p) => p.outcome === "met").length,
    notMet: plans.filter((p) => p.outcome === "not_met").length,
    closed: plans.filter((p) => p.outcome === "closed").length,
    overdueReviews: open.flatMap((p) => p.reviews).filter((r) => !r.done && r.due < today).length,
    reviewsDone: plans.flatMap((p) => p.reviews).filter((r) => r.done).length,
    reviewsDuePct: reviewsDue.length ? Math.round((reviewsDue.filter((r) => r.done).length / reviewsDue.length) * 100) : null,
  };
}

// ---- Pipeline Audit (nine yes/no checks) ----
export const AUDIT_CHECKS = [
  "Stage matches buyer action", "Dated next step", "Decision maker known", "Need confirmed", "Last contact within cadence",
  "Competition or alternative known", "Close date has a reason", "Value agreed with buyer", "Realistic stage age",
];
export const auditScore = (answers: (boolean | null)[]): number => answers.filter((a) => a === true).length;

export type AuditDeal = { dealRef?: string | null; answers: (boolean | null)[] };
/** A deal counts once all nine checks are answered; a half-filled deal is shown but left out of the averages. */
export const auditComplete = (answers: (boolean | null)[]): boolean => answers.length === AUDIT_CHECKS.length && answers.every((a) => a === true || a === false);

/** Summary of one manager's audit: average score out of 9, and how often each check was a No (the weakest is the habit to fix first). */
export function auditSummary(deals: AuditDeal[]) {
  const done = deals.filter((d) => auditComplete(d.answers));
  const noCounts = AUDIT_CHECKS.map((_, i) => done.filter((d) => d.answers[i] === false).length);
  const max = Math.max(0, ...noCounts);
  return {
    started: deals.filter((d) => (d.dealRef ?? "").trim() || d.answers.some((a) => a !== null)).length,
    completed: done.length,
    avgScore: done.length ? Math.round((done.reduce((s, d) => s + auditScore(d.answers), 0) / done.length) * 10) / 10 : null,
    noCounts,
    weakestIndex: max > 0 ? noCounts.indexOf(max) : null,
  };
}

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

export type Weights = { key: string; label: string; weight: number }[];
/** The cohort's weights: the defaults, with any weight the facilitator set for this cohort. Always seven criteria. */
export function weightsFor(config: Record<string, unknown> | null | undefined): Weights {
  const set = (config?.scorecard_weights ?? {}) as Record<string, unknown>;
  return SCORECARD_DEFAULT.map((c) => ({ ...c, weight: typeof set[c.key] === "number" && (set[c.key] as number) >= 0 ? (set[c.key] as number) : c.weight }));
}
export const weightsValid = (w: Weights) => w.reduce((s, c) => s + c.weight, 0) === 100;

export type CallIn = { repRef: string; scoredOn?: string | null; ratings: Record<string, number | null> };
/** One manager's call scoring: overall and per-rep averages, and the criterion that scores lowest (where coaching should start). */
export function callSummary(calls: CallIn[], weights: Weights = SCORECARD_DEFAULT) {
  const scored = calls.map((c) => ({ ...c, score: weightedScore(c.ratings, weights) })).filter((c): c is typeof c & { score: number } => c.score != null);
  const reps = new Map<string, number[]>();
  for (const c of scored) reps.set(c.repRef, [...(reps.get(c.repRef) ?? []), c.score]);
  const avg = (a: number[]) => Math.round((a.reduce((s, x) => s + x, 0) / a.length) * 10) / 10;
  const perCriterion = weights.map((w) => {
    const r = scored.map((c) => c.ratings[w.key]).filter((x): x is number => typeof x === "number");
    return { key: w.key, label: w.label, avgRating: r.length ? Math.round((r.reduce((s, x) => s + x, 0) / r.length) * 10) / 10 : null };
  });
  const rated = perCriterion.filter((c) => c.avgRating != null);
  const lowest = rated.length ? rated.reduce((m, c) => (c.avgRating! < m.avgRating! ? c : m)) : null;
  return {
    calls: scored.length,
    reps: reps.size,
    avgScore: scored.length ? avg(scored.map((c) => c.score)) : null,
    perRep: [...reps.entries()].map(([rep, v]) => ({ rep, calls: v.length, avg: avg(v) })).sort((x, y) => x.avg - y.avg),
    perCriterion,
    weakestKey: lowest && lowest.avgRating! < 5 ? lowest.key : null,
  };
}

// ---- Calibration ----
export function calibration(a: Record<string, number | null>, b: Record<string, number | null>, keys = SCORECARD_DEFAULT.map((c) => c.key)) {
  const gaps = keys.map((k) => (a[k] != null && b[k] != null ? Math.abs(a[k]! - b[k]!) : null));
  const known = gaps.filter((g): g is number => g != null);
  return { gaps, bigGaps: known.filter((g) => g >= 2).length, avgGap: known.length ? Math.round((known.reduce((s, g) => s + g, 0) / known.length) * 10) / 10 : null };
}

export type CalibrationPair = { a: Record<string, number | null>; b: Record<string, number | null> };
/** Across compared calls: the average gap, and for each criterion how often two managers were 2 or more points apart. */
export function calibrationSummary(pairs: CalibrationPair[], criteria = SCORECARD_DEFAULT) {
  const each = pairs.map((p) => calibration(p.a, p.b, criteria.map((c) => c.key))).filter((r) => r.avgGap != null);
  const per = criteria.map((c, i) => {
    const gaps = each.map((r) => r.gaps[i]).filter((g): g is number => g != null);
    return { key: c.key, label: c.label, bigGapPct: gaps.length ? Math.round((gaps.filter((g) => g >= 2).length / gaps.length) * 100) : null, avgGap: gaps.length ? Math.round((gaps.reduce((s2, g) => s2 + g, 0) / gaps.length) * 10) / 10 : null };
  });
  const worst = per.filter((x) => (x.bigGapPct ?? 0) > 0).sort((x, y) => (y.bigGapPct ?? 0) - (x.bigGapPct ?? 0))[0];
  return {
    compared: each.length,
    avgGap: each.length ? Math.round((each.reduce((s2, r) => s2 + (r.avgGap ?? 0), 0) / each.length) * 10) / 10 : null,
    per,
    mostDisagreedKey: worst?.key ?? null,
  };
}

// ---- Rep Banding ----
export const BAND_DEFAULT = { rampUpTo: 3, developingUpTo: 12 };
export const bandOf = (tenureMonths: number, b = BAND_DEFAULT): "Ramp up" | "Developing" | "Established" => (tenureMonths <= b.rampUpTo ? "Ramp up" : tenureMonths <= b.developingUpTo ? "Developing" : "Established");
export const BAND_CUTOFFS = { low: 80, high: 120 };
export type Focus = "diagnose" | "stretch" | "learn";
export const FOCUS_LABEL: Record<Focus, string> = { diagnose: "Diagnose: skill, will or system", stretch: "In band: stretch", learn: "Learn from them and retain them" };
export function focusOf(pctOfBandAverage: number | null, cut = BAND_CUTOFFS): Focus | null {
  if (pctOfBandAverage == null) return null;
  return pctOfBandAverage < cut.low ? "diagnose" : pctOfBandAverage > cut.high ? "learn" : "stretch";
}
export function bandingFocus(pctOfBandAverage: number | null, cut = BAND_CUTOFFS): string | null {
  const f = focusOf(pctOfBandAverage, cut);
  return f ? FOCUS_LABEL[f] : null;
}

export type BandingSetup = { limits: { rampUpTo: number; developingUpTo: number }; cut: { low: number; high: number } };
/** The cohort's tenure band limits and the 80 / 120 cut-offs, with any change the facilitator made for this cohort. */
export function bandingFor(config: Record<string, unknown> | null | undefined): BandingSetup {
  const b = (config?.banding ?? {}) as Record<string, unknown>;
  const n = (k: string, d: number) => (typeof b[k] === "number" ? (b[k] as number) : d);
  const limits = { rampUpTo: n("rampUpTo", BAND_DEFAULT.rampUpTo), developingUpTo: n("developingUpTo", BAND_DEFAULT.developingUpTo) };
  const cut = { low: n("low", BAND_CUTOFFS.low), high: n("high", BAND_CUTOFFS.high) };
  const ok = limits.rampUpTo >= 1 && limits.developingUpTo > limits.rampUpTo && cut.low > 0 && cut.high > cut.low;
  return ok ? { limits, cut } : { limits: { ...BAND_DEFAULT }, cut: { ...BAND_CUTOFFS } };
}

export type RepIn = { repRef: string; tenureMonths: number; output: number | null };
/** Group reps by tenure and compare each with the average of their own band. Used to decide where coaching time goes, never to rank or reward. */
export function bandReps(reps: RepIn[], setup: BandingSetup = { limits: BAND_DEFAULT, cut: BAND_CUTOFFS }) {
  const names = ["Ramp up", "Developing", "Established"] as const;
  const withBand = reps.map((r) => ({ ...r, band: bandOf(r.tenureMonths, setup.limits) }));
  const avgOf = new Map<string, number | null>();
  for (const band of names) {
    const o = withBand.filter((r) => r.band === band && r.output != null).map((r) => r.output as number);
    avgOf.set(band, o.length ? o.reduce((a, x) => a + x, 0) / o.length : null);
  }
  const rows = withBand.map((r) => {
    const avg = avgOf.get(r.band) ?? null;
    const alone = withBand.filter((x) => x.band === r.band && x.output != null).length < 2;
    const pct = r.output != null && avg ? Math.round((r.output / avg) * 100) : null;
    return { ...r, bandAvg: avg == null ? null : Math.round(avg * 10) / 10, pct, alone, focus: alone ? null : focusOf(pct, setup.cut) };
  });
  const count = (f: Focus) => rows.filter((r) => r.focus === f).length;
  return {
    rows, total: rows.length, diagnose: count("diagnose"), stretch: count("stretch"), learn: count("learn"),
    perBand: names.map((b) => ({ band: b as string, reps: rows.filter((r) => r.band === b).length, avg: avgOf.get(b) == null ? null : Math.round((avgOf.get(b) as number) * 10) / 10 })),
  };
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
