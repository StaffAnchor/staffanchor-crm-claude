import type { SupabaseClient } from "@supabase/supabase-js";
import { AUDIT_CHECKS, MEASURES, auditSummary, bandFor, calibrationSummary, callSummary, coachingSummary, forecastSummary, reviewSummary, weightsFor, type Band, type Weights, cohortRollup, measuresImproved, progressPct, resultOf, change, type MeasureKey, type Pair } from "./calc";
import type { LabCohort, LabMember } from "./auth";

export const SESSION_TITLES = [
  "Pipeline and lead management", "Follow-up and conversion", "Targets, forecasts and reviews",
  "Coaching and call quality", "Performance and team health", "Capstone",
];

export type MemberMetrics = {
  member: LabMember;
  values: Partial<Record<MeasureKey, Pair>>;
  baselineEntered: number; endlineEntered: number;
  attended: number; assignmentsDone: number;
  improved: number; progress: number;
  audit: ReturnType<typeof auditSummary>;
  forecast: ReturnType<typeof forecastSummary>;
  reviews: ReturnType<typeof reviewSummary>;
  coaching: ReturnType<typeof coachingSummary>;
  calls: ReturnType<typeof callSummary>;
};

export type CohortData = {
  cohort: LabCohort;
  sessions: { id: string; n: number; title: string; held_on: string | null }[];
  sessionsHeld: number;
  members: LabMember[];
  managers: MemberMetrics[];
  rollup: ReturnType<typeof cohortRollup>;
  kpis: { managers: number; avgProgress: number | null; attendancePct: number | null; baselinePct: number | null; endlinePct: number | null; assignmentsPct: number | null; improvingOn3Plus: number };
  attendance: { session_id: string; member_id: string; present: boolean }[];
  weights: Weights;
  band: Band;
  coachingStats: { managers: number; total: number; reps: number; gaps: Record<string, number>; systemSharePct: number | null; overdue: number; followUps: number; followedUp: number };
  reviewStats: { managers: number; total: number; actionLoggedPct: number | null; causes: Record<string, number>; overdue: number; followUps: number; followedUp: number };
  forecastStats: { managers: number; months: number; avgAccuracy: number | null; withinBandPct: number | null; overPct: number | null; underPct: number | null };
  calibration: ReturnType<typeof calibrationSummary> & { started: number };
  callStats: { managersScoring: number; calls: number; avgScore: number | null; perCriterion: { key: string; label: string; avgRating: number | null }[]; weakestKey: string | null };
  audit: { managersAudited: number; avgScore: number | null; noPct: (number | null)[]; weakestIndex: number | null };
};

const today = () => new Date().toISOString().slice(0, 10);

export async function loadCohort(db: SupabaseClient, cohortId: string): Promise<CohortData | null> {
  const { data: cohort } = await db.from("lab_cohorts").select("id, company_name, name, start_date, status, config").eq("id", cohortId).maybeSingle();
  if (!cohort) return null;
  const [{ data: members }, { data: sessions }] = await Promise.all([
    db.from("lab_members").select("id, cohort_id, email, full_name, role, reports_to, profile, profile_done_at, active").eq("cohort_id", cohortId).eq("active", true).order("full_name"),
    db.from("lab_sessions").select("id, n, title, held_on").eq("cohort_id", cohortId).order("n"),
  ]);
  const mem = (members ?? []) as LabMember[];
  const ses = (sessions ?? []) as CohortData["sessions"];
  const ids = mem.map((m) => m.id);
  const sesIds = ses.map((s) => s.id);
  const [{ data: vals }, { data: att }, { data: asg }, { data: auditRows }, { data: callRows }, { data: fcRows }, { data: rvRows }, { data: cpRows }] = await Promise.all([
    ids.length ? db.from("lab_measure_values").select("member_id, measure_key, phase, value").in("member_id", ids) : Promise.resolve({ data: [] }),
    sesIds.length ? db.from("lab_attendance").select("session_id, member_id, present").in("session_id", sesIds) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_assignments").select("member_id, session_n, done").in("member_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_audit_deals").select("member_id, deal_ref, answers").in("member_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_call_scores").select("member_id, rep_ref, ratings").in("member_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_forecast_months").select("member_id, month, commit, actual").in("member_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_review_preps").select("member_id, root_cause, action_logged, follow_up_on, followed_up").in("member_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_coaching_preps").select("member_id, rep_ref, gap, follow_up_on, followed_up").in("member_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const cpAll = ((cpRows ?? []) as { member_id: string; rep_ref: string; gap: string | null; follow_up_on: string | null; followed_up: boolean }[]).map((r) => ({ memberId: r.member_id, repRef: r.rep_ref, gap: r.gap as "skill" | "will" | "system" | "unclear" | null, followUpOn: r.follow_up_on, followedUp: r.followed_up }));
  const rvAll = ((rvRows ?? []) as { member_id: string; root_cause: string | null; action_logged: boolean | null; follow_up_on: string | null; followed_up: boolean }[]).map((r) => ({ memberId: r.member_id, rootCause: r.root_cause as "skill" | "will" | "system" | "unclear" | null, actionLogged: r.action_logged, followUpOn: r.follow_up_on, followedUp: r.followed_up }));
  const band = bandFor(cohort.config as Record<string, unknown>);
  const weights = weightsFor(cohort.config as Record<string, unknown>);
  // A session counts as held once its date is today or earlier, or once attendance has been marked for it.
  const marked = new Set(((att ?? []) as { session_id: string }[]).map((a) => a.session_id));
  const heldSessions = ses.filter((s) => (s.held_on && s.held_on <= today()) || marked.has(s.id));
  const heldIds = new Set(heldSessions.map((s) => s.id));
  const heldNs = new Set(heldSessions.map((s) => s.n));

  const managersRaw = mem.filter((m) => m.role === "manager");
  const managers: MemberMetrics[] = managersRaw.map((m) => {
    const values: Partial<Record<MeasureKey, Pair>> = {};
    for (const mk of MEASURES) values[mk.key] = { baseline: null, endline: null };
    for (const v of (vals ?? []) as { member_id: string; measure_key: MeasureKey; phase: "baseline" | "endline"; value: number | null }[]) {
      if (v.member_id === m.id && values[v.measure_key]) values[v.measure_key]![v.phase] = v.value == null ? null : Number(v.value);
    }
    const baselineEntered = MEASURES.filter((x) => values[x.key]!.baseline != null).length;
    const endlineEntered = MEASURES.filter((x) => values[x.key]!.endline != null).length;
    const attended = ((att ?? []) as { session_id: string; member_id: string; present: boolean }[]).filter((a) => a.member_id === m.id && a.present && heldIds.has(a.session_id)).length;
    const assignmentsDone = ((asg ?? []) as { member_id: string; session_n: number; done: boolean }[]).filter((a) => a.member_id === m.id && a.done && heldNs.has(a.session_n)).length;
    const audit = auditSummary(((auditRows ?? []) as { member_id: string; deal_ref: string | null; answers: (boolean | null)[] }[]).filter((a) => a.member_id === m.id).map((a) => ({ dealRef: a.deal_ref, answers: a.answers })));
    const calls = callSummary(((callRows ?? []) as { member_id: string; rep_ref: string; ratings: Record<string, number> }[]).filter((c) => c.member_id === m.id).map((c) => ({ repRef: c.rep_ref, ratings: c.ratings })), weights);
    return {
      member: m, audit, calls, coaching: coachingSummary(cpAll.filter((r) => r.memberId === m.id)), reviews: reviewSummary(rvAll.filter((r) => r.memberId === m.id)),
      forecast: forecastSummary(((fcRows ?? []) as { member_id: string; month: string; commit: number | null; actual: number | null }[]).filter((f) => f.member_id === m.id).map((f) => ({ month: f.month, commit: f.commit == null ? null : Number(f.commit), actual: f.actual == null ? null : Number(f.actual) })), band), values, baselineEntered, endlineEntered, attended, assignmentsDone,
      improved: measuresImproved(values),
      progress: progressPct({ profileDone: !!m.profile_done_at, baselineEntered, endlineEntered, sessionsHeld: heldSessions.length, attended, assignmentsDone }),
    };
  });

  const rollup = cohortRollup(managers.map((m) => ({ memberId: m.member.id, values: m.values })));
  const n = managers.length;
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);
  const kpis = {
    managers: n,
    avgProgress: n ? Math.round(managers.reduce((s, m) => s + m.progress, 0) / n) : null,
    attendancePct: pct(managers.reduce((s, m) => s + m.attended, 0), n * heldSessions.length),
    baselinePct: pct(managers.filter((m) => m.baselineEntered === MEASURES.length).length, n),
    endlinePct: pct(managers.filter((m) => m.endlineEntered === MEASURES.length).length, n),
    assignmentsPct: pct(managers.reduce((s, m) => s + m.assignmentsDone, 0), n * heldSessions.length),
    improvingOn3Plus: rollup.improvingOn3Plus,
  };
  // Cohort view of the audit: how many managers have audited, the average score, and how often each check was a No.
  const audited = managers.filter((m) => m.audit.completed > 0);
  const totalDeals = audited.reduce((s, m) => s + m.audit.completed, 0);
  const noPct = AUDIT_CHECKS.map((_, i) => (totalDeals ? Math.round((audited.reduce((s, m) => s + m.audit.noCounts[i], 0) / totalDeals) * 100) : null));
  const maxNo = Math.max(0, ...noPct.map((x) => x ?? 0));
  const auditStats = {
    managersAudited: audited.length,
    avgScore: audited.length ? Math.round((audited.reduce((s, m) => s + (m.audit.avgScore ?? 0), 0) / audited.length) * 10) / 10 : null,
    noPct,
    weakestIndex: maxNo > 0 ? noPct.indexOf(maxNo) : null,
  };
  // Cohort view of call quality: every scored call across the cohort, so the averages weight each call equally.
  const allCalls = ((callRows ?? []) as { rep_ref: string; ratings: Record<string, number> }[]).map((c) => ({ repRef: c.rep_ref, ratings: c.ratings }));
  const cohortCalls = callSummary(allCalls, weights);
  const callStats = { managersScoring: managers.filter((m) => m.calls.calls > 0).length, calls: cohortCalls.calls, avgScore: cohortCalls.avgScore, perCriterion: cohortCalls.perCriterion, weakestKey: cohortCalls.weakestKey };
  // Calibration across the cohort: only calls both managers have scored count, and the managers' names are not needed.
  const { data: cals } = await db.from("lab_calibrations").select("id, a_member, b_member").eq("cohort_id", cohortId);
  const calIds = ((cals ?? []) as { id: string }[]).map((c) => c.id);
  const { data: calScores } = calIds.length ? await db.from("lab_calibration_scores").select("calibration_id, member_id, ratings").in("calibration_id", calIds) : { data: [] };
  const pairs = ((cals ?? []) as { id: string; a_member: string; b_member: string | null }[]).flatMap((c) => {
    const rs = ((calScores ?? []) as { calibration_id: string; member_id: string; ratings: Record<string, number> }[]).filter((x) => x.calibration_id === c.id);
    const a = rs.find((x) => x.member_id === c.a_member)?.ratings, b = c.b_member ? rs.find((x) => x.member_id === c.b_member)?.ratings : undefined;
    return a && b ? [{ a, b }] : [];
  });
  const calib = { ...calibrationSummary(pairs), started: (cals ?? []).length };
  // Cohort view of forecasting: every month with a commit and an actual, across all managers.
  const fm = managers.flatMap((m) => m.forecast.rows).filter((r) => r.accuracy != null);
  const fpct = (x: number) => (fm.length ? Math.round((x / fm.length) * 100) : null);
  const forecastStats = {
    managers: managers.filter((m) => m.forecast.months > 0).length,
    months: fm.length,
    avgAccuracy: fm.length ? Math.round(fm.reduce((s2, r) => s2 + (r.accuracy as number), 0) / fm.length) : null,
    withinBandPct: fpct(fm.filter((r) => r.read === "Accurate").length),
    overPct: fpct(fm.filter((r) => r.read === "Over-called").length),
    underPct: fpct(fm.filter((r) => r.read === "Under-called").length),
  };
  const rv = reviewSummary(rvAll.filter((r) => ids.includes(r.memberId) && managersRaw.some((m) => m.id === r.memberId)));
  const reviewStats = { managers: managers.filter((m) => m.reviews.total > 0).length, total: rv.total, actionLoggedPct: rv.actionLoggedPct, causes: rv.causes as Record<string, number>, overdue: rv.overdue, followUps: rv.followUps, followedUp: rv.followedUp };
  // Cohort view of coaching: reps are counted per manager (the same ID can mean different people in different teams).
  const cp = coachingSummary(cpAll.filter((r) => managersRaw.some((m) => m.id === r.memberId)));
  const coachingStats = { managers: managers.filter((m) => m.coaching.total > 0).length, total: cp.total, reps: managers.reduce((s2, m) => s2 + m.coaching.reps, 0), gaps: cp.gaps as Record<string, number>, systemSharePct: cp.systemSharePct, overdue: cp.overdue, followUps: cp.followUps, followedUp: cp.followedUp };
  return { cohort: cohort as LabCohort, weights, band, coachingStats, reviewStats, forecastStats, calibration: calib, callStats, audit: auditStats, sessions: ses, sessionsHeld: heldSessions.length, members: mem, managers, rollup, kpis, attendance: (att ?? []) as CohortData["attendance"] };
}

export { resultOf, change };
