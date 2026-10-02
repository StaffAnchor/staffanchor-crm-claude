import type { SupabaseClient } from "@supabase/supabase-js";
import { hasJd, hasMustHaves, type DeskLink, type DeskMandate, type DeskTask } from "@/lib/today-desk";

// Task packets: the work a recruiter has to do, grouped the way they would do
// it. Instead of one reminder per candidate (hundreds of "No movement: X"
// lines), there is one packet per role and job: "Review 48 applicants for
// K21 Inside Sales Associate", with a deadline, an owner and one button that
// opens the screen where the work gets done. Packets are worked out from the
// live pipeline, so they close themselves when the pipeline moves.

export type PacketKind =
  | "review_applicants"
  | "send_shortlist"
  | "chase_client"
  | "coordinate_interviews"
  | "second_round_calls"
  | "record_assessment"
  | "new_matches"
  | "setup_role"
  | "sales_followups"
  | "other";

export type SlaState = "overdue" | "due" | "ok";

export type PacketItem = { label: string; sub: string | null; href: string };

export type TaskPacket = {
  id: string;
  kind: PacketKind;
  title: string;
  context: string; // "Client · Role"
  mandateId: string | null;
  count: number;
  oldestDays: number;
  slaDays: number;
  state: SlaState;
  overdueByDays: number;
  // A month or more late: shown apart so fresh work is not buried under it.
  backlog: boolean;
  owners: { id: string; name: string }[];
  primary: { label: string; href: string };
  items: PacketItem[];
  moreItems: number;
};

// How long each kind of work may wait before it is late.
export const SLA_DAYS: Record<PacketKind, number> = {
  review_applicants: 2,
  send_shortlist: 2,
  chase_client: 5,
  coordinate_interviews: 1,
  second_round_calls: 2,
  record_assessment: 7,
  new_matches: 7,
  setup_role: 3,
  sales_followups: 5,
  other: 3,
};

export const KIND_LABEL: Record<PacketKind, string> = {
  review_applicants: "Review applicants",
  send_shortlist: "Send to client",
  chase_client: "Chase client",
  coordinate_interviews: "Interviews",
  second_round_calls: "Calls",
  record_assessment: "Assessments",
  new_matches: "New matches",
  setup_role: "Role setup",
  sales_followups: "Prospects",
  other: "Other",
};

const KIND_WEIGHT: Record<PacketKind, number> = {
  coordinate_interviews: 0,
  second_round_calls: 1,
  send_shortlist: 2,
  chase_client: 3,
  review_applicants: 4,
  setup_role: 5,
  new_matches: 6,
  sales_followups: 7,
  record_assessment: 8,
  other: 9,
};

const SHORTLIST_STALE_DAYS = 2;
const CLIENT_SILENT_DAYS = 5;
const ITEMS_SHOWN = 6;
const WITH_CLIENT = new Set(["submitted", "client_shortlisted", "client_interview"]);
const DEAD_STAGES = new Set(["rejected", "pulled_back", "placed"]);
const DAY_MS = 24 * 60 * 60 * 1000;
export const BACKLOG_AFTER_DAYS = 30;

// Mine = staffed on it, or nobody is yet.
export function isMine(p: TaskPacket, userId: string): boolean {
  return p.owners.length === 0 || p.owners.some((o) => o.id === userId);
}

// Bulk reminders that are handled by automation, never by a person.
const AUTOMATED_TYPES = new Set(["INCOMPLETE_PROFILE", "STALE_CANDIDATE"]);
const SALES_TYPES = new Set(["SALES_LEAD_STALE", "SALES_LEAD_FOLLOWUP_DUE", "SALES_CLIENT_CHECKIN", "SALES_REFERRAL_ASK"]);

export type PacketInput = {
  now: Date;
  mandates: DeskMandate[];
  links: DeskLink[];
  tasks: DeskTask[];
  // Who is staffed on each role.
  owners: Map<string, { id: string; name: string }[]>;
  // Names for task assignees.
  people: Map<string, string>;
};

export type TaskBoard = {
  packets: TaskPacket[];
  summary: { overdue: number; due: number; ok: number; backlog: number; total: number };
  automated: { remindersHandled: number; groupedFrom: number; packetsFromThem: number };
  doneToday: number;
};

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

function slaState(age: number, sla: number): { state: SlaState; overdueBy: number } {
  if (age > sla) return { state: "overdue", overdueBy: age - sla };
  if (age >= Math.max(1, Math.ceil(sla / 2))) return { state: "due", overdueBy: 0 };
  return { state: "ok", overdueBy: 0 };
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

function taskHref(t: DeskTask): string {
  if (t.task_type.startsWith("SALES_")) return "/client-acquisition/sales";
  if (t.candidate_id) return `/candidates/${t.candidate_id}${t.mandate_id ? `?mandateId=${t.mandate_id}` : ""}`;
  if (t.mandate_id) return `/mandates/${t.mandate_id}`;
  if (t.client_id) return `/clients/${t.client_id}`;
  return "/inbox";
}

export function buildTaskBoard(input: PacketInput): TaskBoard {
  const { now, mandates, links, tasks, owners, people } = input;
  const packets: TaskPacket[] = [];
  const roleOf = new Map(mandates.map((m) => [m.id, m]));
  const label = (m: DeskMandate) => `${m.client_name ?? "Client"} · ${m.role_title ?? "Role"}`;

  const push = (p: Omit<TaskPacket, "state" | "overdueByDays" | "slaDays" | "moreItems" | "backlog"> & { items: PacketItem[]; oldestDays: number }) => {
    const sla = SLA_DAYS[p.kind];
    const { state, overdueBy } = slaState(p.oldestDays, sla);
    packets.push({ ...p, slaDays: sla, state, overdueByDays: overdueBy, backlog: overdueBy >= BACKLOG_AFTER_DAYS, items: p.items.slice(0, ITEMS_SHOWN), moreItems: Math.max(0, p.items.length - ITEMS_SHOWN) });
  };

  const linksByMandate = new Map<string, DeskLink[]>();
  for (const l of links) {
    const a = linksByMandate.get(l.mandate_id) ?? [];
    a.push(l);
    linksByMandate.set(l.mandate_id, a);
  }

  const chasedMandates = new Set<string>();

  for (const m of mandates) {
    const ml = linksByMandate.get(m.id) ?? [];
    const ownerList = owners.get(m.id) ?? [];
    const ctx = label(m);
    const link = (l: DeskLink) => `/candidates/${l.candidate_id}?mandateId=${m.id}`;

    // Role set-up: no JD or no must-haves means nothing can be matched.
    if (!hasJd(m) || !hasMustHaves(m)) {
      const noJd = !hasJd(m);
      push({
        id: `setup-${m.id}`,
        kind: "setup_role",
        title: noJd ? "Add the job description" : "Set the must-haves",
        context: ctx,
        mandateId: m.id,
        count: 1,
        oldestDays: daysSince(m.created_at, now),
        owners: ownerList,
        primary: { label: noJd ? "Add the JD" : "Set must-haves", href: `/mandates/${m.id}` },
        items: [{ label: noJd ? "Matching can't start without a JD" : "Without must-haves every candidate looks like a good match", sub: null, href: `/mandates/${m.id}` }],
      });
    }

    // Applicants waiting for a first decision.
    const sourced = ml.filter((l) => l.stage === "sourced").sort((a, b) => Number(!!a.viewed_at) - Number(!!b.viewed_at) || a.created_at.localeCompare(b.created_at));
    if (sourced.length > 0) {
      push({
        id: `review-${m.id}`,
        kind: "review_applicants",
        title: `Review ${sourced.length} ${plural(sourced.length, "applicant")}`,
        context: ctx,
        mandateId: m.id,
        count: sourced.length,
        oldestDays: Math.max(...sourced.map((l) => daysSince(l.created_at, now))),
        owners: ownerList,
        primary: { label: "Start reviewing", href: `/mandates/${m.id}/triage` },
        items: sourced.map((l) => ({ label: l.candidate_name ?? "Candidate", sub: `${l.viewed_at ? "Opened" : "Not opened"} · applied ${daysSince(l.created_at, now)}d ago`, href: link(l) })),
      });
    }

    // Shortlisted but not yet with the client.
    const shortlisted = ml.filter((l) => l.stage === "shortlisted" && daysSince(l.stage_updated_at ?? l.created_at, now) >= SHORTLIST_STALE_DAYS);
    if (shortlisted.length > 0) {
      push({
        id: `send-${m.id}`,
        kind: "send_shortlist",
        title: `Send ${shortlisted.length} shortlisted ${plural(shortlisted.length, "profile")} to the client`,
        context: ctx,
        mandateId: m.id,
        count: shortlisted.length,
        oldestDays: Math.max(...shortlisted.map((l) => daysSince(l.stage_updated_at ?? l.created_at, now))),
        owners: ownerList,
        primary: { label: "Review and send", href: `/mandates/${m.id}?stage=shortlisted` },
        items: shortlisted.map((l) => ({ label: l.candidate_name ?? "Candidate", sub: `Shortlisted ${daysSince(l.stage_updated_at ?? l.created_at, now)}d ago`, href: link(l) })),
      });
    }

    // Profiles with the client and no reply.
    const silent = ml.filter((l) => WITH_CLIENT.has(l.stage) && daysSince(l.stage_updated_at ?? l.created_at, now) >= CLIENT_SILENT_DAYS);
    if (silent.length > 0) {
      chasedMandates.add(m.id);
      push({
        id: `chase-${m.id}`,
        kind: "chase_client",
        title: `Chase the client on ${silent.length} ${plural(silent.length, "profile")}`,
        context: ctx,
        mandateId: m.id,
        count: silent.length,
        oldestDays: Math.max(...silent.map((l) => daysSince(l.stage_updated_at ?? l.created_at, now))),
        owners: ownerList,
        primary: { label: "Open the sent profiles", href: `/mandates/${m.id}?stage=submitted` },
        items: silent.map((l) => ({ label: l.candidate_name ?? "Candidate", sub: `No reply for ${daysSince(l.stage_updated_at ?? l.created_at, now)}d`, href: link(l) })),
      });
    }
  }

  // Tasks created by the system, kept only when still relevant, then grouped
  // per role.
  const alive = tasks.filter((t) => !AUTOMATED_TYPES.has(t.task_type) && !(t.link_stage && DEAD_STAGES.has(t.link_stage)));
  const fresh = (t: DeskTask) => !(t.task_type === "INTERVIEW_REMINDER" && daysSince(t.created_at, now) > 1);
  const live = alive.filter(fresh);

  const grouped = new Map<string, DeskTask[]>();
  const loose: DeskTask[] = [];
  for (const t of live) {
    const kind: PacketKind | null =
      t.task_type === "TRIGGER_INTERVIEW_COORDINATION" ? "coordinate_interviews"
      : t.task_type === "CANDIDATE_CALL_REQUEST" ? "second_round_calls"
      : t.task_type === "MISSING_ASSESSMENT" ? "record_assessment"
      : t.task_type === "RESURFACED_MATCHES" ? "new_matches"
      : t.task_type === "CLIENT_FEEDBACK_OVERDUE" ? "chase_client"
      : SALES_TYPES.has(t.task_type) ? "sales_followups"
      : null;
    if (!kind) {
      loose.push(t);
      continue;
    }
    if (kind === "chase_client" && t.mandate_id && chasedMandates.has(t.mandate_id)) continue; // already covered from the pipeline
    const key = kind === "sales_followups" ? "sales" : `${kind}|${t.mandate_id ?? "none"}`;
    const a = grouped.get(key) ?? [];
    a.push(t);
    grouped.set(key, a);
  }

  for (const [key, ts] of grouped) {
    const kind = (key === "sales" ? "sales_followups" : key.split("|")[0]) as PacketKind;
    const mid = ts[0].mandate_id;
    const m = mid ? roleOf.get(mid) : undefined;
    const ctx = kind === "sales_followups" ? "Client acquisition" : m ? label(m) : `${ts[0].mandate_client_name ?? ""} · ${ts[0].mandate_role_title ?? ""}`.replace(/^ · | · $/g, "");
    const n = ts.length;
    const titles: Record<PacketKind, string> = {
      coordinate_interviews: `Coordinate ${n} ${plural(n, "interview")}`,
      second_round_calls: `Make ${n} second-round ${plural(n, "call")}`,
      record_assessment: `Record ${n} ${plural(n, "assessment")}`,
      new_matches: n === 1 ? ts[0].title.split(":")[0] : `${n} match alerts`,
      chase_client: `Chase client feedback`,
      sales_followups: `Follow up ${n} ${plural(n, "prospect")}`,
      review_applicants: "", send_shortlist: "", setup_role: "", other: "",
    };
    const primary: Record<string, { label: string; href: string }> = {
      coordinate_interviews: { label: "Open interviews", href: "/interviews" },
      second_round_calls: { label: "Open the call list", href: "/calls-flagged" },
      record_assessment: { label: "Open the role", href: mid ? `/mandates/${mid}` : "/mandates" },
      new_matches: { label: "See the matches", href: mid ? `/mandates/${mid}/ai-matches` : "/mandates" },
      chase_client: { label: "Open the role", href: mid ? `/mandates/${mid}?stage=submitted` : "/mandates" },
      sales_followups: { label: "Open prospects", href: "/client-acquisition/sales" },
    };
    const owner = ts.find((t) => t.recruiter_id)?.recruiter_id;
    push({
      id: `${kind}-${mid ?? "x"}-${ts[0].id}`,
      kind,
      title: titles[kind],
      context: ctx,
      mandateId: mid,
      count: n,
      oldestDays: Math.max(...ts.map((t) => daysSince(t.created_at, now))),
      owners: owner ? [{ id: owner, name: people.get(owner) ?? "Assigned" }] : [],
      primary: primary[kind],
      items: ts.map((t) => ({ label: t.candidate_name ?? t.title, sub: t.candidate_name ? t.title.replace(/^[^:—]+[:—]\s*/, "") : null, href: taskHref(t) })),
    });
  }

  // Everything else stays as a single, plainly worded task.
  for (const t of loose) {
    const owner = t.recruiter_id;
    push({
      id: `other-${t.id}`,
      kind: "other",
      title: t.title,
      context: [t.mandate_client_name, t.mandate_role_title].filter(Boolean).join(" · ") || "General",
      mandateId: t.mandate_id,
      count: 1,
      oldestDays: daysSince(t.created_at, now),
      owners: owner ? [{ id: owner, name: people.get(owner) ?? "Assigned" }] : [],
      primary: { label: "Open", href: taskHref(t) },
      items: [],
    });
  }

  const stateRank: Record<SlaState, number> = { overdue: 0, due: 1, ok: 2 };
  packets.sort(
    (a, b) =>
      stateRank[a.state] - stateRank[b.state] ||
      KIND_WEIGHT[a.kind] - KIND_WEIGHT[b.kind] ||
      b.overdueByDays - a.overdueByDays ||
      b.count - a.count
  );

  const summary = {
    overdue: packets.filter((p) => p.state === "overdue" && !p.backlog).length,
    backlog: packets.filter((p) => p.backlog).length,
    due: packets.filter((p) => p.state === "due").length,
    ok: packets.filter((p) => p.state === "ok").length,
    total: packets.length,
  };

  const groupedFrom = tasks.filter((t) => t.task_type === "STALE_CANDIDATE" || t.task_type === "CANDIDATE_CALL_REQUEST" || t.task_type === "MISSING_ASSESSMENT" || t.task_type === "TRIGGER_INTERVIEW_COORDINATION").length;
  const automatedCount = tasks.filter((t) => AUTOMATED_TYPES.has(t.task_type)).length;
  return {
    packets,
    summary,
    automated: { remindersHandled: automatedCount, groupedFrom, packetsFromThem: packets.filter((p) => ["review_applicants", "second_round_calls", "record_assessment", "coordinate_interviews"].includes(p.kind)).length },
    doneToday: 0,
  };
}

export async function loadTaskBoard(supabase: SupabaseClient): Promise<TaskBoard> {
  const now = new Date();
  const [mandatesRes, tasksRes, assignRes, peopleRes] = await Promise.all([
    supabase
      .from("mandates")
      .select("id, client_name, role_title, created_at, job_description, jd_overview, jd_responsibilities, jd_candidate_profile, must_haves")
      .eq("status", "open")
      .eq("is_archived", false),
    supabase.rpc("get_my_inbox"),
    supabase.from("mandate_assignments").select("mandate_id, freelancer_id"),
    supabase.from("profiles").select("id, full_name, email").in("role", ["admin", "recruiter", "partner"]),
  ]);

  const mandates = (mandatesRes.data ?? []) as DeskMandate[];
  const people = new Map<string, string>(((peopleRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[]).map((p) => [p.id, p.full_name ?? p.email ?? "Team"]));
  const owners = new Map<string, { id: string; name: string }[]>();
  for (const a of (assignRes.data ?? []) as { mandate_id: string; freelancer_id: string }[]) {
    if (!people.has(a.freelancer_id)) continue;
    const list = owners.get(a.mandate_id) ?? [];
    list.push({ id: a.freelancer_id, name: people.get(a.freelancer_id) as string });
    owners.set(a.mandate_id, list);
  }

  const ids = mandates.map((m) => m.id);
  const links: DeskLink[] = [];
  if (ids.length > 0) {
    for (let offset = 0; offset < 20000; offset += 1000) {
      const { data } = await supabase
        .from("candidate_mandate_links")
        .select("id, mandate_id, candidate_id, stage, stage_updated_at, created_at, viewed_at, confirmed_interview_at, date_of_joining, candidates(full_name)")
        .in("mandate_id", ids)
        .order("created_at", { ascending: true })
        .range(offset, offset + 999);
      const rows = (data ?? []) as unknown as (Omit<DeskLink, "candidate_name"> & { candidates: { full_name: string | null } | { full_name: string | null }[] | null })[];
      for (const r of rows) {
        const c = Array.isArray(r.candidates) ? r.candidates[0] : r.candidates;
        links.push({ ...r, candidate_name: c?.full_name ?? null });
      }
      if (rows.length < 1000) break;
    }
  }
  const tasks = ((tasksRes.data ?? []) as DeskTask[]).filter((t) => t && t.id);

  return buildTaskBoard({ now, mandates, links, tasks, owners, people });
}
