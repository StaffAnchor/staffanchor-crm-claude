import type { SupabaseClient } from "@supabase/supabase-js";

// "Today" desk: a short, decision-first home screen. Everything here is
// derived deterministically from rows the CRM already has (stages, stage
// dates, JD fields, the recruiter inbox) -- no AI call, no new tables, so it
// is always current and costs nothing. The rules live in one place
// (thresholds + buildTodayDesk) so they can be read, tested and tuned.

// A shortlisted candidate that has sat unsent this long is a nudge-worthy
// delay; past URGENT it becomes an "urgent" decision.
export const SHORTLIST_STALE_DAYS = 2;
export const SHORTLIST_URGENT_DAYS = 5;
// Profiles sent to a client with no movement for this long = client is silent.
export const CLIENT_SILENT_DAYS = 5;
// This many applicants nobody has opened is worth a decision of its own.
export const UNREVIEWED_THRESHOLD = 5;
// A role open this long with nothing sent to the client is "behind".
export const NO_SUBMISSION_DAYS = 7;
// Nothing in the pipeline has moved for this long = "slow".
export const PIPELINE_QUIET_DAYS = 7;
// A task older than this is probably dead (the interview happened, the
// candidate moved on). It stays in All tasks but leaves the daily list.
export const TASK_FRESH_DAYS = 21;
// Interview reminders are only useful on the day.
export const REMINDER_FRESH_DAYS = 1;
const DEAD_STAGES = new Set(["rejected", "pulled_back", "placed"]);
export const MAX_DECISIONS = 6;
export const MAX_NEXT_UP = 3;

// Tasks that are bulk housekeeping rather than work for a person. They are
// still in All tasks, just not in the daily list.
export const ROUTINE_TASK_TYPES = new Set(["INCOMPLETE_PROFILE", "STALE_CANDIDATE", "MISSING_ASSESSMENT"]);

const ACTIVE_STAGES = new Set(["sourced", "screened", "shortlisted", "submitted", "client_shortlisted", "client_interview", "offer"]);
const SENT_STAGES = new Set(["submitted", "client_shortlisted", "client_interview", "offer", "placed"]);
const WITH_CLIENT_STAGES = new Set(["submitted", "client_shortlisted", "client_interview"]);

export type DeskMandate = {
  id: string;
  client_name: string | null;
  role_title: string | null;
  created_at: string;
  job_description: unknown;
  jd_overview: unknown;
  jd_responsibilities: unknown;
  jd_candidate_profile: unknown;
  must_haves: unknown;
};

export type DeskLink = {
  id: string;
  mandate_id: string;
  candidate_id: string;
  stage: string;
  stage_updated_at: string | null;
  created_at: string;
  viewed_at: string | null;
  confirmed_interview_at: string | null;
  date_of_joining: string | null;
  candidate_name?: string | null;
};

export type DeskTask = {
  id: string;
  task_type: string;
  title: string;
  detail: string | null;
  priority: string | null;
  candidate_id: string | null;
  candidate_name: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  client_id: string | null;
  recruiter_id: string | null;
  link_stage?: string | null;
  created_at?: string | null;
};

export type Tone = "urgent" | "attention" | "info";

export type Decision = {
  id: string;
  tone: Tone;
  title: string;
  detail: string;
  actionLabel: string;
  href: string;
  rank: number;
};

export type RoleHealth = "behind" | "slow" | "ontrack";

export type RoleRow = {
  mandateId: string;
  role: string;
  client: string;
  daysOpen: number;
  inPipeline: number;
  unreviewed: number;
  shortlisted: number;
  sent: number;
  interviewing: number;
  health: RoleHealth;
  healthNote: string;
  // Separate from health: a role can be moving fine and still lack a JD or
  // must-haves, and vice versa. Shown as its own flag.
  setupNote: string | null;
};

export type NextUp = {
  id: string;
  title: string;
  context: string;
  priority: string | null;
  href: string;
};

export type TodayDesk = {
  firstName: string;
  greeting: string;
  metrics: {
    interviewsToday: { count: number; names: string[] };
    waitingOnClients: { links: number; clients: number };
    offersOpen: number;
    placements: { done: number; target: number | null };
  };
  decisions: Decision[];
  moreDecisions: number;
  roles: RoleRow[];
  nextUp: NextUp[];
  moreNextUp: number;
  staleCount: number;
  routineCount: number;
  routineCapped: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function nonEmpty(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.some((x) => nonEmpty(x));
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).some((x) => nonEmpty(x));
  return false;
}

export function hasJd(m: DeskMandate): boolean {
  return nonEmpty(m.job_description) || nonEmpty(m.jd_overview) || nonEmpty(m.jd_responsibilities) || nonEmpty(m.jd_candidate_profile);
}

export function hasMustHaves(m: DeskMandate): boolean {
  return nonEmpty(m.must_haves);
}

function daysSince(iso: string | null, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

// Calendar day / month in India time, since that is when the team works.
function istParts(d: Date): { ymd: string; ym: string; hour: number } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? "";
  return { ymd: `${get("year")}-${get("month")}-${get("day")}`, ym: `${get("year")}-${get("month")}`, hour: Number(get("hour")) };
}

// Within the same priority, work that moves a placement forward comes before
// prospecting nudges. Unknown types sit in the middle.
const TASK_WEIGHT: Record<string, number> = {
  INTERVIEW_REMINDER: 0,
  FOLLOW_UP_ON_OFFER: 0,
  SECOND_ROUND_OUTCOME: 1,
  CANDIDATE_CALL_REQUEST: 1,
  TRIGGER_INTERVIEW_COORDINATION: 1,
  CLIENT_FEEDBACK_OVERDUE: 2,
  CLIENT_STAGE_UPDATE: 2,
  POST_PLACEMENT_CHECKIN: 3,
  RESURFACED_MATCHES: 3,
  SALES_LEAD_FOLLOWUP_DUE: 5,
  SALES_CLIENT_CHECKIN: 5,
  SALES_REFERRAL_ASK: 5,
  SALES_LEAD_STALE: 6,
};
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

function taskHref(t: DeskTask): string {
  if (t.task_type.startsWith("SALES_")) return "/client-acquisition/sales";
  if (t.candidate_id) return `/candidates/${t.candidate_id}`;
  if (t.mandate_id) return `/mandates/${t.mandate_id}`;
  if (t.client_id) return `/clients/${t.client_id}`;
  return "/inbox";
}

const TONE_RANK: Record<Tone, number> = { urgent: 0, attention: 1, info: 2 };

export function buildTodayDesk(input: {
  now: Date;
  userId: string;
  fullName: string | null;
  mandates: DeskMandate[];
  links: DeskLink[];
  tasks: DeskTask[];
  placementTarget: number | null;
  tasksCapped?: boolean;
}): TodayDesk {
  const { now, userId, mandates, links, tasks } = input;
  const today = istParts(now);

  const linksByMandate = new Map<string, DeskLink[]>();
  for (const l of links) {
    const arr = linksByMandate.get(l.mandate_id) ?? [];
    arr.push(l);
    linksByMandate.set(l.mandate_id, arr);
  }

  const decisions: Decision[] = [];
  const roles: RoleRow[] = [];

  for (const m of mandates) {
    const role = m.role_title ?? "Untitled role";
    const client = m.client_name ?? "Client";
    const href = `/mandates/${m.id}`;
    const ml = linksByMandate.get(m.id) ?? [];
    const active = ml.filter((l) => ACTIVE_STAGES.has(l.stage));
    const unreviewed = active.filter((l) => l.stage === "sourced" && !l.viewed_at);
    const shortlisted = active.filter((l) => l.stage === "shortlisted");
    const sent = ml.filter((l) => SENT_STAGES.has(l.stage));
    const interviewing = ml.filter((l) => l.stage === "client_interview");
    const withClient = ml.filter((l) => WITH_CLIENT_STAGES.has(l.stage));
    const daysOpen = daysSince(m.created_at, now);

    const jd = hasJd(m);
    const musts = hasMustHaves(m);

    // --- decisions: at most one per role, the most important one ---
    const candidates: Decision[] = [];

    if (!jd) {
      candidates.push({
        id: `jd-${m.id}`,
        tone: "urgent",
        title: `${role} has no job description`,
        detail: `${client} · matching can't start until the role is defined`,
        actionLabel: "Add the JD",
        href,
        rank: 0,
      });
    } else if (!musts) {
      candidates.push({
        id: `must-${m.id}`,
        tone: "attention",
        title: `Set the must-haves for ${role}`,
        detail: `${client} · without them every candidate looks like a good match`,
        actionLabel: "Set must-haves",
        href,
        rank: 3,
      });
    }

    const staleShortlist = shortlisted.filter((l) => daysSince(l.stage_updated_at ?? l.created_at, now) >= SHORTLIST_STALE_DAYS);
    if (staleShortlist.length > 0) {
      const oldest = Math.max(...staleShortlist.map((l) => daysSince(l.stage_updated_at ?? l.created_at, now)));
      candidates.push({
        id: `send-${m.id}`,
        tone: oldest >= SHORTLIST_URGENT_DAYS ? "urgent" : "attention",
        title: `${staleShortlist.length} shortlisted ${plural(staleShortlist.length, "profile")} not sent to ${client}`,
        detail: `${role} · waiting ${oldest} ${plural(oldest, "day")}`,
        actionLabel: "Review and send",
        href: `${href}?stage=shortlisted`,
        rank: 1,
      });
    }

    const silent = withClient.filter((l) => daysSince(l.stage_updated_at ?? l.created_at, now) >= CLIENT_SILENT_DAYS);
    if (silent.length > 0) {
      const longest = Math.max(...silent.map((l) => daysSince(l.stage_updated_at ?? l.created_at, now)));
      candidates.push({
        id: `silent-${m.id}`,
        tone: longest >= 10 ? "urgent" : "attention",
        title: `${client} hasn't replied on ${silent.length} ${plural(silent.length, "profile")}`,
        detail: `${role} · longest wait ${longest} days`,
        actionLabel: "Chase the client",
        href: `${href}?stage=submitted`,
        rank: 2,
      });
    }

    if (unreviewed.length >= UNREVIEWED_THRESHOLD) {
      const oldest = Math.max(...unreviewed.map((l) => daysSince(l.created_at, now)));
      candidates.push({
        id: `review-${m.id}`,
        tone: "attention",
        title: `${unreviewed.length} applicants for ${role} not reviewed`,
        detail: `${client} · oldest applied ${oldest} ${plural(oldest, "day")} ago`,
        actionLabel: "Review applicants",
        href: `${href}/triage`,
        rank: 4,
      });
    }

    if (jd && musts && sent.length === 0 && daysOpen >= NO_SUBMISSION_DAYS && active.length > 0 && staleShortlist.length === 0) {
      candidates.push({
        id: `nosend-${m.id}`,
        tone: "attention",
        title: `No profile sent to ${client} yet`,
        detail: `${role} · open ${daysOpen} days, ${active.length} in the pipeline`,
        actionLabel: "Pick the best to send",
        href: `${href}/triage`,
        rank: 5,
      });
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.rank - b.rank);
      decisions.push(candidates[0]);
    }

    // --- role table row ---
    const lastMove = active.reduce((acc, l) => Math.min(acc, daysSince(l.stage_updated_at ?? l.created_at, now)), Number.POSITIVE_INFINITY);
    let health: RoleHealth = "ontrack";
    let healthNote = "Moving";
    if (sent.length === 0 && daysOpen >= NO_SUBMISSION_DAYS) {
      health = "behind";
      healthNote = `Nothing sent in ${daysOpen} days`;
    } else if (active.length > 0 && Number.isFinite(lastMove) && lastMove >= PIPELINE_QUIET_DAYS) {
      health = "slow";
      healthNote = `No movement in ${lastMove} days`;
    } else if (active.length === 0) {
      health = "slow";
      healthNote = "Empty pipeline";
    }
    const setupNote = !jd ? "Needs a JD" : !musts ? "Needs must-haves" : null;

    roles.push({
      mandateId: m.id,
      role,
      client,
      daysOpen,
      inPipeline: active.length,
      unreviewed: unreviewed.length,
      shortlisted: shortlisted.length,
      sent: ml.filter((l) => l.stage === "submitted" || l.stage === "client_shortlisted").length,
      interviewing: interviewing.length + ml.filter((l) => l.stage === "offer").length,
      health,
      healthNote,
      setupNote,
    });
  }

  decisions.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || a.rank - b.rank);
  const shownDecisions = decisions.slice(0, MAX_DECISIONS);

  const healthOrder: Record<RoleHealth, number> = { behind: 0, slow: 1, ontrack: 2 };
  roles.sort(
    (a, b) => healthOrder[a.health] - healthOrder[b.health] || Number(!!b.setupNote) - Number(!!a.setupNote) || b.daysOpen - a.daysOpen
  );

  // --- metrics ---
  const interviews = links.filter((l) => l.confirmed_interview_at && istParts(new Date(l.confirmed_interview_at)).ymd === today.ymd);
  const silentLinks = links.filter(
    (l) => WITH_CLIENT_STAGES.has(l.stage) && daysSince(l.stage_updated_at ?? l.created_at, now) >= CLIENT_SILENT_DAYS
  );
  const silentClients = new Set(silentLinks.map((l) => l.mandate_id)).size;
  const placed = links.filter((l) => {
    if (l.stage !== "placed") return false;
    const when = l.date_of_joining ?? l.stage_updated_at;
    return when ? istParts(new Date(when)).ym === today.ym : false;
  });

  // --- next up: real tasks for me (or nobody yet), not bulk reminders ---
  const nowMs = now.getTime();
  const ageDays = (iso?: string | null) => (iso ? (nowMs - new Date(iso).getTime()) / DAY_MS : 0);
  const isDead = (t: DeskTask) => !!t.link_stage && DEAD_STAGES.has(t.link_stage);
  const isStale = (t: DeskTask) => ageDays(t.created_at) > (t.task_type === "INTERVIEW_REMINDER" ? REMINDER_FRESH_DAYS : TASK_FRESH_DAYS);
  const mineAll = tasks.filter((t) => !ROUTINE_TASK_TYPES.has(t.task_type) && (t.recruiter_id === userId || t.recruiter_id === null));
  const staleCount = mineAll.filter((t) => isDead(t) || isStale(t)).length;
  const mine = mineAll
    .filter((t) => !isDead(t) && !isStale(t))
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        (PRIORITY_RANK[a.t.priority ?? "normal"] ?? 1) - (PRIORITY_RANK[b.t.priority ?? "normal"] ?? 1) ||
        (TASK_WEIGHT[a.t.task_type] ?? 4) - (TASK_WEIGHT[b.t.task_type] ?? 4) ||
        a.i - b.i
    )
    .map((x) => x.t);
  const routine = tasks.filter((t) => ROUTINE_TASK_TYPES.has(t.task_type));
  const nextUp: NextUp[] = mine.slice(0, MAX_NEXT_UP).map((t) => ({
    id: t.id,
    title: t.title,
    context: [t.candidate_name, t.mandate_role_title && t.mandate_client_name ? `${t.mandate_role_title} · ${t.mandate_client_name}` : t.mandate_role_title ?? t.mandate_client_name]
      .filter(Boolean)
      .join(" · "),
    priority: t.priority,
    href: taskHref(t),
  }));

  const firstName = (input.fullName ?? "").trim().split(/\s+/)[0] || "there";
  const greeting = today.hour < 12 ? "Good morning" : today.hour < 17 ? "Good afternoon" : "Good evening";

  return {
    firstName,
    greeting,
    metrics: {
      interviewsToday: { count: interviews.length, names: interviews.map((l) => l.candidate_name).filter((n): n is string => !!n) },
      waitingOnClients: { links: silentLinks.length, clients: silentClients },
      offersOpen: links.filter((l) => l.stage === "offer").length,
      placements: { done: placed.length, target: input.placementTarget },
    },
    decisions: shownDecisions,
    moreDecisions: Math.max(0, decisions.length - shownDecisions.length),
    roles,
    nextUp,
    moreNextUp: Math.max(0, mine.length - nextUp.length),
    staleCount,
    routineCount: routine.length,
    routineCapped: !!input.tasksCapped,
  };
}

export async function loadTodayDesk(supabase: SupabaseClient, userId: string, fullName: string | null): Promise<TodayDesk> {
  const now = new Date();
  const monthStart = `${istParts(now).ym}-01`;

  const [mandatesRes, tasksRes, targetRes] = await Promise.all([
    supabase
      .from("mandates")
      .select("id, client_name, role_title, created_at, job_description, jd_overview, jd_responsibilities, jd_candidate_profile, must_haves")
      .eq("status", "open")
      .eq("is_archived", false)
      .order("created_at", { ascending: true }),
    supabase.rpc("get_my_inbox"),
    supabase.from("fy_placement_targets").select("target_placements").eq("month_start", monthStart).maybeSingle(),
  ]);

  const mandates = (mandatesRes.data ?? []) as DeskMandate[];
  const mandateIds = mandates.map((m) => m.id);

  // Links can pass 1000 rows over time (PostgREST's silent cap), so page by
  // mandate id and range rather than assuming one query is enough.
  const links: DeskLink[] = [];
  if (mandateIds.length > 0) {
    const PAGE = 1000;
    for (let offset = 0; offset < 20000; offset += PAGE) {
      const { data } = await supabase
        .from("candidate_mandate_links")
        .select("id, mandate_id, candidate_id, stage, stage_updated_at, created_at, viewed_at, confirmed_interview_at, date_of_joining, candidates(full_name)")
        .in("mandate_id", mandateIds)
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      const rows = (data ?? []) as unknown as (Omit<DeskLink, "candidate_name"> & { candidates: { full_name: string | null } | { full_name: string | null }[] | null })[];
      for (const r of rows) {
        const c = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
        links.push({ ...r, candidate_name: c?.full_name ?? null });
      }
      if (rows.length < PAGE) break;
    }
  }

  const tasks = ((tasksRes.data ?? []) as DeskTask[]).filter((t) => t && t.id);

  return buildTodayDesk({
    now,
    userId,
    fullName,
    mandates,
    links,
    tasks,
    placementTarget: (targetRes.data as { target_placements: number } | null)?.target_placements ?? null,
    tasksCapped: tasks.length >= 1000,
  });
}
