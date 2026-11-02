import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import CallsDesk, { type CallBackRow, type CallHistoryRow, type CallPerson } from "../calls/calls-desk";
import { GAP_LABEL, STRENGTH, isGate, isVital } from "@/lib/completion";
import { loadPriorityCalls } from "@/lib/priority-calls";
import CompletionsCard, { type Trend } from "./completions-card";
import TargetControl, { type Target } from "./target-control";
import BatchPanel from "../pipeline/batch-panel";
import { Bot } from "lucide-react";

export const dynamic = "force-dynamic";

// Profile completion: for every group and practice, how many profiles have everything needed to present a candidate and how
// many are still to go, by city and by what is missing, with a deadline per practice and a call list to finish them.

type Row = { profile_group: string; bucket: string; total: number; complete: number; incomplete: number; no_phone: number; assessed: number; vitals_incomplete: number; gate_incomplete: number; looking_known: number; gaps: Record<string, number>; strengths: Record<string, number> };
type City = { city: string; total: number; complete: number; incomplete: number };

const GROUPS = [
  { key: "b2b_sales", label: "B2B Sales", note: "First priority" },
  { key: "b2c_sales", label: "B2C Sales", note: "Second priority" },
  { key: "non_sales", label: "Non-Sales", note: "Functions" },
  { key: "unclear", label: "Needs a look", note: "Domain not decided" },
] as const;
const GROUP_LABEL = Object.fromEntries(GROUPS.map((g) => [g.key, g.label])) as Record<string, string>;
const BY = [
  { key: "sub_group", label: "Practice" },
  { key: "sub_domain", label: "Specialization" },
] as const;

// Midnight today in India, as an ISO time, so "today" means the recruiter's day.
function istDayStartIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - 5.5 * 3_600_000).toISOString();
}

const card = "rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900";
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const n0 = (n: number) => n.toLocaleString("en-IN");
function StrengthBar({ s, total }: { s: Record<string, number>; total: number }) {
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Profile strength split">
        {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (s[k] ? <div key={k} className={STRENGTH[k].bar} style={{ width: `${(s[k] / Math.max(1, total)) * 100}%` }} title={`${STRENGTH[k].label}: ${s[k]}`} /> : null))}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-2.5 text-[11px] text-slate-500">
        {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (s[k] ? <span key={k}><b className="tabular-nums text-slate-700 dark:text-slate-200">{s[k]}</b> {STRENGTH[k].label.toLowerCase()}</span> : null))}
      </p>
    </div>
  );
}
const bucketLabel = (b: string) => (b === "(not set)" ? "Not set yet" : b);

function Bar({ done, total, tone = "bg-teal-500" }: { done: number; total: number; tone?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${pct(done, total)}% complete`}>
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct(done, total)}%` }} />
    </div>
  );
}

export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ group?: string; by?: string; sub?: string; city?: string; gap?: string; strength?: string; mode?: string; cluster?: string; metro?: string; pool?: string; list?: string; open?: string }> }) {
  const sp = await searchParams;
  const group = GROUPS.some((g) => g.key === sp.group) ? (sp.group as string) : "b2b_sales";
  const by = sp.by === "sub_domain" ? "sub_domain" : "sub_group";
  const sub = sp.sub ?? null; // a bucket name, or "*" for the whole group
  const city = sp.city ?? null;
  const gap = sp.gap && GAP_LABEL[sp.gap] ? sp.gap : null;
  const strength = sp.strength && STRENGTH[sp.strength] ? sp.strength : null;
  // Filters that come from the supply map (a kind of role in a city) and the talent pool.
  const cluster = sp.cluster && /^[a-z0-9_]+$/.test(sp.cluster) ? sp.cluster : null;
  const metro = sp.metro ? sp.metro.slice(0, 40) : null;
  const pool = sp.pool === "1";
  const scoped = !!(cluster || pool);
  // Until current pay and a CV are in for everyone, those two are the only reason to call; the call form still collects the rest.
  const mode = "gate";

  const priorityView = sub === "priority";
  const openId = sp.open && /^[0-9a-f-]{36}$/i.test(sp.open) ? sp.open : null;
  const working = sub !== null;
  const bucketKey = sub && sub !== "*" && !priorityView ? sub : null;

  const supabase = await createClient();
  // Everything the page needs is asked for at once: the pages used to wait for each query in turn, which is what made them slow.
  const queueArgs = priorityView
    ? { p_group: null, p_by: by, p_city: city, p_mode: mode, p_limit: 60 }
    : { p_group: group, p_by: by, p_bucket: bucketKey, p_city: city, p_gap: gap, p_strength: strength, p_mode: mode, p_cluster: cluster, p_metro: metro, p_pool: pool, p_limit: 50 };
  const [
    { data: authData },
    { data: myRole },
    { data: overview },
    { data: targetRows },
    openQRes,
    trendRes,
    clusterRes,
    dupRes,
    { data: cityData },
    priority,
    queueRes,
    callsRes,
    backsRes,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("current_user_role"),
    supabase.rpc("completion_overview", { p_by: by }),
    supabase.from("completion_targets").select("profile_group, by_field, bucket, due_on, baseline_incomplete").eq("by_field", by),
    working ? Promise.resolve({ count: 0 }) : supabase.from("bot_questions").select("id", { count: "exact", head: true }).eq("status", "open"),
    working ? Promise.resolve({ data: null }) : supabase.rpc("completion_trend", { p_group: ["b2b_sales", "b2c_sales", "non_sales"].includes(group) ? group : null, p_days: 30 }),
    cluster ? supabase.from("role_clusters").select("name").eq("slug", cluster).maybeSingle() : Promise.resolve({ data: null }),
    sub ? Promise.resolve({ data: 0 }) : supabase.rpc("duplicate_phone_profiles"),
    // Cities: inside the chosen practice when working, otherwise across the whole group.
    supabase.rpc("completion_cities", { p_group: group, p_by: by, p_bucket: bucketKey }),
    !sub || priorityView ? loadPriorityCalls(supabase, "staff") : Promise.resolve(null),
    working ? supabase.rpc("completion_queue", queueArgs) : Promise.resolve({ data: null, error: null }),
    supabase.rpc("call_history_today", { p_since: istDayStartIso() }),
    supabase.rpc("call_backs_pending"),
  ]);
  const user = authData?.user;
  if (!user) redirect("/login");
  if (!myRole || !["admin", "recruiter", "partner", "freelancer"].includes(myRole as string)) redirect("/today");
  const openQuestions = (openQRes as { count?: number | null }).count ?? 0;
  const trend = ((trendRes as { data: unknown }).data ?? null) as Trend | null;
  const clusterName = cluster ? ((clusterRes as { data: { name?: string } | null }).data?.name ?? cluster) : null;
  const dupCount = Number((dupRes as { data: unknown }).data ?? 0);
  const rows = ((overview ?? []) as Row[]).map((r) => ({ ...r, gaps: r.gaps ?? {}, strengths: r.strengths ?? {} }));
  const targets = new Map<string, Target>();
  for (const t of (targetRows ?? []) as (Target & { profile_group: string; bucket: string })[]) targets.set(`${t.profile_group}|${t.bucket}`, t);

  const sum = (rs: Row[]) => rs.reduce((a, r) => ({ total: a.total + r.total, complete: a.complete + r.complete, incomplete: a.incomplete + r.incomplete, no_phone: a.no_phone + r.no_phone, assessed: a.assessed + r.assessed, vitals_incomplete: a.vitals_incomplete + r.vitals_incomplete, gate_incomplete: a.gate_incomplete + r.gate_incomplete, looking_known: a.looking_known + r.looking_known }), { total: 0, complete: 0, incomplete: 0, no_phone: 0, assessed: 0, vitals_incomplete: 0, gate_incomplete: 0, looking_known: 0 });
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g.key, sum(rows.filter((r) => r.profile_group === g.key))])) as Record<string, ReturnType<typeof sum>>;
  const grand = sum(rows);
  const groupRows = rows.filter((r) => r.profile_group === group).sort((a, b) => b.incomplete - a.incomplete);
  const groupGaps: Record<string, number> = {};
  for (const r of groupRows) for (const [k, v] of Object.entries(r.gaps)) groupGaps[k] = (groupGaps[k] ?? 0) + v;
  const addStrengths = (rs: Row[]) => rs.reduce<Record<string, number>>((a, r) => { for (const [k, v] of Object.entries(r.strengths)) a[k] = (a[k] ?? 0) + v; return a; }, {});
  const groupStrengths = Object.fromEntries(GROUPS.map((g) => [g.key, addStrengths(rows.filter((r) => r.profile_group === g.key))])) as Record<string, Record<string, number>>;

  const url = (o: Partial<{ group: string; by: string; sub: string | null; city: string | null; gap: string | null; strength: string | null; mode: string; cluster: string | null; metro: string | null; pool: boolean; list: string }>) => {
    const q = new URLSearchParams();
    const g = o.group ?? group;
    q.set("group", g);
    const b = o.by ?? by;
    if (b !== "sub_group") q.set("by", b);
    const s = "sub" in o ? o.sub : sub;
    if (s) q.set("sub", s);
    const c = "city" in o ? o.city : city;
    if (c) q.set("city", c);
    const ga = "gap" in o ? o.gap : gap;
    if (ga) q.set("gap", ga);
    const st = "strength" in o ? o.strength : strength;
    if (st) q.set("strength", st);
    const m = o.mode ?? mode;
    if (m !== "gate") q.set("mode", m);
    const cl = "cluster" in o ? o.cluster : cluster;
    if (cl) q.set("cluster", cl);
    const me = "metro" in o ? o.metro : metro;
    if (me) q.set("metro", me);
    if ("pool" in o ? o.pool : pool) q.set("pool", "1");
    if (o.list) q.set("list", o.list);
    return `/candidates/complete?${q.toString()}`;
  };

  const focusRow = working && !priorityView ? (bucketKey ? groupRows.find((r) => r.bucket === bucketKey) : { ...sum(groupRows), profile_group: group, bucket: "*", gaps: groupGaps, strengths: groupStrengths[group] ?? {} }) : null;

  const cities = ((cityData ?? []) as City[]).filter((c) => c.incomplete > 0).sort((a, b) => b.incomplete - a.incomplete).slice(0, 14);

  // Turns queue rows (ids in order, with their gaps and strength) into people the call desk can show.
  type QueueRow = { id: string; gaps: string[]; strength: string; why: string[] };
  type Extra = { id: string; email: string | null; profile_group: string | null; sub_domain: string | null };
  const hydrate = async (q: QueueRow[], alsoIds: string[]): Promise<{ people: CallPerson[]; extra: Map<string, Extra> }> => {
    const ids = q.map((x) => x.id);
    const allIds = Array.from(new Set([...ids, ...alsoIds]));
    if (allIds.length === 0) return { people: [], extra: new Map() };
    const [callRes, extraRes] = await Promise.all([
      ids.length ? supabase.rpc("calls_for_candidates", { p_ids: ids }) : Promise.resolve({ data: [] }),
      supabase.from("candidates").select("id, email, profile_group, sub_domain").in("id", allIds),
    ]);
    const extra = new Map(((extraRes.data ?? []) as Extra[]).map((e) => [e.id, e]));
    const meta = new Map(q.map((x) => [x.id, x]));
    const byId = new Map(((callRes.data ?? []) as CallPerson[]).map((p) => [p.id, p]));
    const people = ids
      .map((id) => byId.get(id))
      .filter((p): p is CallPerson => !!p)
      .map((p) => {
        const m = meta.get(p.id)!;
        const gaps = [...m.gaps.filter(isGate), ...m.gaps.filter((g) => isVital(g) && !isGate(g)), ...m.gaps.filter((g) => !isVital(g))];
        return { ...p, resume_url: null, reason: "details_missing" as const, gaps, strength: m.strength, why: m.why ?? [], email: extra.get(p.id)?.email ?? null, profile_group: extra.get(p.id)?.profile_group ?? null, sub_domain: extra.get(p.id)?.sub_domain ?? null };
      });
    return { people, extra };
  };

  const listKind: "priority" | "pay" = sp.list === "pay" ? "pay" : sp.list === "priority" ? "priority" : priority && priority.people.length > 0 ? "priority" : "pay";
  const payTotal = grand.gate_incomplete;
  let people: CallPerson[] = [];
  let queueError: string | null = null;
  if (working) {
    const qr = queueRes as { data: unknown; error: { message: string } | null };
    if (qr.error) queueError = qr.error.message;
    const queue = (qr.data ?? []) as QueueRow[];
    const rest = await hydrate(queue, priorityView ? priority?.people.map((p) => p.id) ?? [] : []);
    if (priorityView && priority) {
      // Priority people come from other lists, so they need the email, domain and sub-domain the call form asks for.
      const ex = rest.extra;
      const prio = priority.people.map((p) => ({ ...p, email: ex.get(p.id)?.email ?? null, profile_group: ex.get(p.id)?.profile_group ?? null, sub_domain: ex.get(p.id)?.sub_domain ?? null }));
      const seen = new Set(prio.map((p) => p.id));
      // Two separate lists: the priority people, and everyone else missing pay or CV (without the priority people).
      people = listKind === "priority" ? prio : rest.people.filter((p) => !seen.has(p.id));
    } else {
      people = rest.people;
    }
  }

  // Calls made today, for the strip above the call list.
  const history = ((callsRes as { data: CallHistoryRow[] | null }).data ?? []) as CallHistoryRow[];
  const todaysCalls = history;
  const mine = todaysCalls.filter((l) => l.caller_id === user.id).length;
  const teamCalls = todaysCalls;
  const myCalls = todaysCalls.filter((l) => l.caller_id === user.id);
  const mySpoke = myCalls.filter((l) => l.outcome === "reached").length;
  const backsDue = priority?.counts.callbacks ?? 0;

  const focusGapEntries = focusRow ? Object.entries(focusRow.gaps).filter(([k]) => isGate(k)).sort((a, b) => Number(isGate(b[0])) - Number(isGate(a[0])) || Number(isVital(b[0])) - Number(isVital(a[0])) || b[1] - a[1]) : [];
  const focusTarget = focusRow ? targets.get(`${group}|${focusRow.bucket}`) ?? null : null;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 max-md:px-3">
      <CandidatesSubNav />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">{working ? "Calls" : "Profile completion"}</h1>
          {!working && (
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            A profile is complete when it has everything needed to present the person to a client: name, phone, email, CV, experience, current and expected pay, notice period,
            city, relocation, domain, sub-domain, role level, company and job title. Current pay and a CV come before everything: without them a profile cannot be used. Then the vitals (current pay, city, role level and type, relocation, domain, sub-domain, CV, plus the basics); expected pay, notice period and the rest come after. Whether someone is looking for a change is asked on every call and counted separately, because it goes stale after 90 days.
          </p>
          )}
        </div>
        {!working && (
        <div className="flex items-center gap-1 text-[12px]">
          <span className="text-slate-500">Group practices by</span>
          {BY.map((b) => (
            <Link key={b.key} href={url({ by: b.key, sub: null })} className={`rounded-full border px-3 py-1 font-medium ${by === b.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
              {b.label}
            </Link>
          ))}
        </div>
        )}
      </div>

      {/* My day: what to do now, first on the page. */}
      {!working && (
        <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className={`${card} p-4`}>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">My calls today</p>
            <p className="mt-1 flex items-baseline gap-2"><span className="text-[30px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{myCalls.length}</span><span className="text-[12.5px] text-slate-500">{myCalls.length > 0 ? `${mySpoke} spoke · ${pct(mySpoke, myCalls.length)}% picked up` : "none yet"}</span></p>
            {backsDue > 0 && <p className="mt-1.5 text-[12.5px] font-medium text-violet-700 dark:text-violet-300">{backsDue} call {backsDue === 1 ? "back" : "backs"} due now</p>}
          </div>
          <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "priority", city: null, gap: null, list: "priority" })} className="flex flex-col justify-between rounded-xl border border-teal-200 bg-teal-50 p-4 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:hover:bg-teal-950/50">
            <span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-teal-800/70 dark:text-teal-200/70">Priority</span>
              <span className="mt-1 block text-[22px] font-semibold leading-none text-teal-900 dark:text-teal-100">{priority?.people.length ?? 0} {(priority?.people.length ?? 0) === 1 ? "call" : "calls"}</span>
              <span className="mt-1 block text-[12px] text-teal-800/80 dark:text-teal-200/80">{[priority && priority.counts.paid > 0 && `${priority.counts.paid} paid ₹199`, priority && priority.counts.interested > 0 && `${priority.counts.interested} said yes`, priority && priority.counts.callbacks > 0 && `${priority.counts.callbacks} call-backs due`, priority && priority.counts.urgent > 0 && `${priority.counts.urgent} urgent ${priority.counts.urgent === 1 ? "role" : "roles"}`].filter(Boolean).join(" · ") || "Nothing urgent right now"}</span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-teal-800 dark:text-teal-200">Start calling <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "priority", city: null, gap: null, list: "pay" })} className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60">
            <span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Missing current pay or CV</span>
              <span className="mt-1 block text-[22px] font-semibold leading-none text-slate-900 dark:text-slate-100">{n0(payTotal)} people</span>
              <span className="mt-1 block text-[12px] text-slate-500">B2B first, then B2C, then the rest</span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-slate-800 dark:text-slate-100">Start calling <ArrowRight className="h-4 w-4" /></span>
          </Link>
          <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "priority", city: null, gap: null, list: "priority" })} className="flex flex-col justify-between rounded-xl border border-violet-200 bg-violet-50 p-4 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/30">
            <span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-violet-800/70 dark:text-violet-200/70">Call backs</span>
              <span className="mt-1 block text-[22px] font-semibold leading-none text-violet-900 dark:text-violet-100">{backsDue} due now</span>
              <span className="mt-1 block text-[12px] text-violet-800/80 dark:text-violet-200/80">People who asked to be called later</span>
            </span>
            <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-semibold text-violet-800 dark:text-violet-200">Open <ArrowRight className="h-4 w-4" /></span>
          </Link>
        </div>
      )}

      {/* The whole base, split by group. Hidden while working a call list so the calls sit at the top of the page. */}
      {!working && (
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {GROUPS.map((g) => {
          const s = byGroup[g.key];
          const on = g.key === group;
          if (g.key === "unclear" && s.total === 0) return null;
          return (
            <Link key={g.key} href={url({ group: g.key, sub: null, city: null, gap: null })} className={`${card} block p-4 transition hover:shadow-sm ${on ? "ring-2 ring-slate-900/70 dark:ring-slate-100/70" : ""}`}>
              <p className="flex items-baseline justify-between text-[12px] text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{g.label}</span>
                <span>{g.note}</span>
              </p>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="text-[28px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{n0(s.total)}</span>
                <span className="text-[12px] text-slate-500">{grand.total > 0 ? `${pct(s.total, grand.total)}% of ${n0(grand.total)} profiles` : "profiles"}</span>
              </p>
              <p className="mb-1 mt-3 flex justify-between text-[11px] font-medium uppercase tracking-wide text-slate-400"><span>Current pay + CV</span><span className="normal-case tracking-normal text-slate-500"><b className="text-amber-700 dark:text-amber-300">{n0(s.gate_incomplete)}</b> to go</span></p>
              <Bar done={s.total - s.gate_incomplete} total={s.total} tone={s.gate_incomplete === 0 ? "bg-emerald-500" : "bg-rose-500"} />
                        </Link>
          );
        })}
      </div>
      )}

      {!working && trend && trend.days.length > 0 && <CompletionsCard initial={trend} group={["b2b_sales", "b2c_sales", "non_sales"].includes(group) ? group : null} label={GROUP_LABEL[group] ?? "All"} />}

      {!working ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{GROUP_LABEL[group]}: {n0(byGroup[group].gate_incomplete)} profiles missing current pay or CV</h2>
              {byGroup[group].gate_incomplete > 0 && (
                <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "*" })} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700">
                  Work on all of {GROUP_LABEL[group]} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {groupRows.length === 0 ? (
              <p className={`${card} p-6 text-[14px] text-slate-500`}>No profiles in this group yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {groupRows.map((r) => {
                  const top = Object.entries(r.gaps).filter(([k]) => isGate(k)).sort((a, b) => Number(isGate(b[0])) - Number(isGate(a[0])) || Number(isVital(b[0])) - Number(isVital(a[0])) || b[1] - a[1]).slice(0, 5);
                  const target = targets.get(`${group}|${r.bucket}`) ?? null;
                  return (
                    <li key={r.bucket} className={`${card} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                        <div className="min-w-0 flex-1 basis-64">
                          <p className="text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{bucketLabel(r.bucket)}</p>
                          <p className="mt-0.5 text-[12.5px] text-slate-500">
                            {n0(r.total)} profiles · current pay + CV <span className="text-emerald-700 dark:text-emerald-300">{n0(r.total - r.gate_incomplete)} done</span> · <b className="text-rose-700 dark:text-rose-300">{n0(r.gate_incomplete)} to go</b>
                            {r.no_phone > 0 && <span> · {r.no_phone} have no usable phone</span>}
                          </p>
                          <div className="mt-2"><Bar done={r.total - r.gate_incomplete} total={r.total} tone={r.gate_incomplete === 0 ? "bg-emerald-500" : "bg-teal-500"} /></div>
                          {top.length > 0 && (
                            <p className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                              {top.map(([k, v]) => (
                                <Link key={k} target="_blank" rel="noopener noreferrer" href={url({ sub: r.bucket, gap: k })} className={`rounded-full px-2 py-0.5 font-medium ${isGate(k) ? "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200" : isVital(k) ? "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                                  {GAP_LABEL[k] ?? k} · {v}
                                </Link>
                              ))}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          {r.gate_incomplete > 0 && <TargetControl group={group} by={by} bucket={r.bucket} incomplete={r.gate_incomplete} target={target} compact />}
                          {r.gate_incomplete > 0 ? (
                            <Link target="_blank" rel="noopener noreferrer" href={url({ sub: r.bucket })} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
                              Call this practice <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Pay + CV complete</span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <aside className="space-y-4">
            <section className={`${card} p-4`}>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Who to call in {GROUP_LABEL[group]}</h3>
              <ul className="mt-2 space-y-1.5">
                {Object.entries(groupGaps).filter(([k]) => isGate(k)).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <li key={k}>
                    <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "*", gap: k })} className="flex items-center justify-between gap-2 text-[12.5px] hover:underline">
                      <span className="text-slate-600 dark:text-slate-300">Missing {GAP_LABEL[k] ?? k}</span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{n0(v)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className={`${card} p-4`}>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Incomplete profiles by city</h3>
              <p className="text-[11.5px] text-slate-500">They cannot come up in matching for a role in that city until completed.</p>
              <ul className="mt-2 space-y-1.5">
                {cities.map((c) => (
                  <li key={c.city}>
                    <Link target="_blank" rel="noopener noreferrer" href={url({ sub: "*", city: c.city })} className="block hover:opacity-80">
                      <span className="flex items-center justify-between text-[12.5px]">
                        <span className="text-slate-700 dark:text-slate-200">{c.city}</span>
                        <span className="text-slate-500"><b className="text-slate-900 dark:text-slate-100">{c.incomplete}</b> of {c.total}</span>
                      </span>
                      <Bar done={c.complete} total={c.total} />
                    </Link>
                  </li>
                ))}
                {cities.length === 0 && <li className="text-[12.5px] text-slate-500">No incomplete profiles.</li>}
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        <div>
          <div className="mb-3">
            <Link href={url({ sub: null, city: null, gap: null })} className="inline-flex items-center gap-1 text-[12.5px] font-medium text-teal-700 hover:underline dark:text-teal-300">
              <ArrowLeft className="h-3.5 w-3.5" /> {priorityView ? "Back to my day" : `All ${GROUP_LABEL[group]} practices`}
            </Link>
          </div>
          {priorityView && priority && (
            <div className={`${card} mb-4 p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">{listKind === "priority" ? "Priority calls" : "Missing current pay or CV"}</h2>
                  <p className="mt-0.5 max-w-3xl text-[13px] text-slate-500">
                    {listKind === "priority" ? (
                      <>
                        {priority.counts.paid > 0 && `${priority.counts.paid} paid ₹199 (soonest deadline first) · `}{priority.counts.interested > 0 && `${priority.counts.interested} said yes to a role · `}{priority.counts.callbacks > 0 && `${priority.counts.callbacks} call-backs due · `}{priority.counts.urgent > 0 && `${priority.counts.urgent} for an urgent role and missing pay or CV`}
                        {priority.urgentRoles.length > 0 && ` Urgent: ${priority.urgentRoles.map((r) => r.title).join(", ")}.`}
                      </>
                    ) : (
                      <>Everyone whose current pay or CV is missing, B2B first, then B2C, then the rest. The priority people are in their own list.</>
                    )}
                  </p>
                </div>
                <div className="text-right text-[12.5px] text-slate-500">
                  <p><span className="text-[22px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{mine}</span> calls by you today</p>
                  <p>Team today: {teamCalls.length} calls, {teamCalls.filter((l) => l.outcome === "reached").length} reached</p>
                </div>
              </div>
              {listKind === "pay" && cities.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="font-medium text-slate-500">City:</span>
                  <Link href={url({ sub: "priority", list: "pay", city: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>All cities</Link>
                  {cities.map((c) => (
                    <Link key={c.city} href={url({ sub: "priority", list: "pay", city: c.city })} className={`rounded-full border px-2.5 py-0.5 font-medium ${city === c.city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>{c.city} · {c.incomplete}</Link>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                {([{ k: "priority", l: `Priority · ${priority.people.length}` }, { k: "pay", l: `Missing pay or CV · ${n0(payTotal)}` }] as const).map((t) => (
                  <Link key={t.k} href={url({ sub: "priority", list: t.k })} className={`rounded-full border px-3 py-1 font-medium ${listKind === t.k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>{t.l}</Link>
                ))}
              </div>
            </div>
          )}
          {priorityView && (
            <details className={`${card} mb-4 px-4 py-3 text-[13px] text-slate-600 dark:text-slate-300`}>
              <summary className="cursor-pointer text-[13px] font-semibold text-slate-800 dark:text-slate-100">How the calls work</summary>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li><b>Two lists:</b> <b>Priority</b> (paid calls, said yes to a role, call-backs due, urgent roles) and <b>Missing pay or CV</b> (everyone else, B2B first). Switch between them at the top. Work the list on the left from top to bottom.</li>
                <li><b>Call, then pick one result.</b> The next person opens by itself.</li>
                <li><b>Spoke:</b> fill in what they tell you. If pay or CV is still missing, they come back after 2 days.</li>
                <li><b>Did not pick up:</b> they come back the next day, up to 3 tries.</li>
                <li><b>Asked to call back:</b> choose the time. At that time they move to the top of the list and also sit under the <b>Call backs</b> tab until then.</li>
                <li><b>Not interested or wrong number:</b> off the list.</li>
                <li><b>Who did I call today?</b> The <b>Called</b> tab, grouped by how each call went. <b>Someone rang you?</b> Type their number in the search box.</li>
              </ol>
            </details>
          )}
          {scoped && (
            <div className={`${card} mb-4 p-4`}>
              <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">
                {pool ? "Talent pool" : GROUP_LABEL[group]}
                {clusterName ? ` › ${clusterName}${metro ? ` in ${metro}` : ""}` : ""}
              </h2>
              <p className="mt-0.5 max-w-3xl text-[13px] text-slate-500">
                {pool ? "Everyone in the talent pool, so the list you call first for any role stays complete and current." : "Everyone we hold for this kind of role in this city."} {people.length} can be called now.
              </p>
            </div>
          )}
          {focusRow && !scoped && (
            <div className={`${card} mb-4 p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1 basis-72">
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">
                    {GROUP_LABEL[group]} › {bucketKey ? bucketLabel(bucketKey) : "all practices"}
                    {city ? ` › ${city}` : ""}
                    {gap ? ` › missing ${GAP_LABEL[gap]}` : ""}
                    {strength ? ` › ${STRENGTH[strength].label.toLowerCase()} profiles` : ""}
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    {n0(focusRow.total)} profiles · pay + CV <b className="text-rose-700 dark:text-rose-300">{n0(focusRow.gate_incomplete)} to go</b> · vitals <span className="text-emerald-700 dark:text-emerald-300">{n0(focusRow.total - focusRow.vitals_incomplete)} complete</span> · <b className="text-amber-700 dark:text-amber-300">{n0(focusRow.vitals_incomplete)} to go</b> · {n0(focusRow.complete)} fully complete · {n0(focusRow.looking_known)} confirmed looking
                    {focusRow.no_phone > 0 && ` · ${focusRow.no_phone} have no usable phone (they need their number first)`}
                  </p>
                  <div className="mt-2 max-w-xl"><Bar done={focusRow.total - focusRow.vitals_incomplete} total={focusRow.total} /></div>
                </div>
                {bucketKey && focusRow.gate_incomplete > 0 && <TargetControl group={group} by={by} bucket={bucketKey} incomplete={focusRow.gate_incomplete} target={focusTarget} />}
              </div>
              <div className="mt-3 max-w-xl"><StrengthBar s={focusRow.strengths} total={focusRow.total} /></div>
              <p className="mt-3 text-[12px] text-slate-500">Call list: people whose <b>current pay</b> or <b>CV</b> is missing, fewest other gaps first. The call form still lets you fill in everything else.</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Strength:</span>
                <Link href={url({ strength: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!strength ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>Any</Link>
                {(["strong", "good", "weak", "poor", "unrated"] as const).map((k) => (
                  <Link key={k} href={url({ strength: k })} className={`rounded-full border px-2.5 py-0.5 font-medium ${strength === k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {STRENGTH[k].label} · {focusRow.strengths[k] ?? 0}
                  </Link>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Only people missing:</span>
                <Link href={url({ gap: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!gap ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>Anything</Link>
                {focusGapEntries.map(([k, v]) => (
                  <Link key={k} href={url({ gap: k })} className={`rounded-full border px-2.5 py-0.5 font-medium ${gap === k ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {k === "current_ctc" || k === "cv" ? "★ " : isVital(k) ? "● " : ""}{GAP_LABEL[k] ?? k} · {v}
                  </Link>
                ))}
              </div>
              {cities.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                  <span className="font-medium text-slate-500">City:</span>
                  <Link href={url({ city: null })} className={`rounded-full border px-2.5 py-0.5 font-medium ${!city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>All cities</Link>
                  {cities.map((c) => (
                    <Link key={c.city} href={url({ city: c.city })} className={`rounded-full border px-2.5 py-0.5 font-medium ${city === c.city ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                      {c.city} · {c.incomplete}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
          {queueError ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-800">Couldn&apos;t load the list: {queueError}</p>
          ) : (
            <>
              <p className="mb-3 text-[12.5px] text-slate-500">
                {priorityView && listKind === "pay" ? `The next ${people.length} of ${n0(payTotal)}` : `${people.length} people`} to call{priorityView && listKind === "priority" ? ", priority first" : ", B2B first"}. Call, fill in what is missing, rate how they came across, pick the result; the next person opens by itself.
                People who didn&apos;t answer come back after a day, up to 3 tries.
              </p>
              <CallsDesk key={`${group}|${by}|${sub}|${city}|${gap}|${strength}|${cluster}|${metro}|${pool}|${listKind}`} people={people} openId={openId} history={history} callBacks={((backsRes as { data: CallBackRow[] | null }).data ?? []) as CallBackRow[]} meId={user.id} />
            </>
          )}
        </div>
      )}

      {!working && dupCount > 0 && (
        <Link href="/candidates/duplicates" className="mt-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
          <span><b>{dupCount} profiles share a phone number</b> with another profile. Merge them so nobody is called twice.</span>
          <span className="inline-flex items-center gap-1 font-semibold">Review duplicates <ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}

      {/* The daily batch of people worth asking for their missing details on WhatsApp (this used to be the Improve profiles page). */}
      <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <BatchPanel />
        <section className={`${card} p-4`}>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            <Bot className="h-4 w-4 text-teal-600" /> Teach the assistant
          </h2>
          <p className="mt-1 text-[13px] text-slate-500">Questions candidates asked that the assistant couldn&apos;t answer. Answer once and it replies next time.</p>
          <p className="mt-3 text-[26px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{openQuestions ?? 0}</p>
          <p className="text-[12px] text-slate-500">waiting to be answered</p>
          <Link href="/whatsapp/training" className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-teal-700 hover:underline dark:text-teal-300">
            Answer them <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
