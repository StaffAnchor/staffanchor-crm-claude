import type { SupabaseClient } from "@supabase/supabase-js";
import { MEASURES, cohortRollup, measuresImproved, progressPct, resultOf, change, type MeasureKey, type Pair } from "./calc";
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
  const [{ data: vals }, { data: att }, { data: asg }] = await Promise.all([
    ids.length ? db.from("lab_measure_values").select("member_id, measure_key, phase, value").in("member_id", ids) : Promise.resolve({ data: [] }),
    sesIds.length ? db.from("lab_attendance").select("session_id, member_id, present").in("session_id", sesIds) : Promise.resolve({ data: [] }),
    ids.length ? db.from("lab_assignments").select("member_id, session_n, done").in("member_id", ids) : Promise.resolve({ data: [] }),
  ]);
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
    return {
      member: m, values, baselineEntered, endlineEntered, attended, assignmentsDone,
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
  return { cohort: cohort as LabCohort, sessions: ses, sessionsHeld: heldSessions.length, members: mem, managers, rollup, kpis, attendance: (att ?? []) as CohortData["attendance"] };
}

export { resultOf, change };
