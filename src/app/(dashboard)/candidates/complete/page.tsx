import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CandidatesSubNav from "../candidates-sub-nav";
import CallsDesk, { type CallPerson } from "../calls/calls-desk";
import { GAP_LABEL, STRENGTH, isGate, isVital } from "@/lib/completion";
import { loadPriorityCalls } from "@/lib/priority-calls";
import TargetControl, { type Target } from "./target-control";
import BatchPanel from "../pipeline/batch-panel";
import { Bot } from "lucide-react";

export const dynamic = "force-dynamic";

// Profile completion: for every group and practice, how many profiles have everything needed to present a candidate and how
// many are still to go, by city and by what is missing, with a deadline per practice and a call list to finish them.

type Row = { profile_group: string; bucket: string; total: number; complete: number; incomplete: number; no_phone: number; assessed: number; vitals_incomplete: number; gate_incomplete: number; looking_known: number; gaps: Record<string, number>; strengths: Record<string, number> };
type Trend = { days: { day: string; gate: number; vitals: number; full: number }[]; mtd: { gate: number; vitals: number; full: number }; people: { name: string; gate: number; vitals: number; full: number }[] };
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
function TrendCard({ trend, label }: { trend: Trend; label: string }) {
  const days = trend.days;
  const max = Math.max(1, ...days.map((d) => d.gate));
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const tile = (title: string, a: { gate: number; vitals: number; full: number } | undefined) => (
    <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-0.5 text-[22px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{a?.gate ?? 0}<span className="ml-1 text-[11.5px] font-normal text-slate-500">pay + CV done</span></p>
      <p className="mt-1 text-[11.5px] text-slate-500">{a?.vitals ?? 0} with all vitals · {a?.full ?? 0} fully complete</p>
    </div>
  );
  const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
  return (
    <section className={`${card} mb-5 p-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Completions · {label}</h2>
        <p className="text-[11.5px] text-slate-400">Counted each time a profile crosses a line. Counting began on 31 Oct 2026.</p>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)_minmax(0,260px)]">
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {tile("Today", today)}
          {tile("Yesterday", yesterday)}
          {tile("Month to date", trend.mtd)}
        </div>
        <div>
          <p className="mb-1 text-[11.5px] text-slate-500">Profiles that got current pay and a CV, per day, last 30 days</p>
          <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Daily completions, last 30 days">
            {days.map((d) => (
              <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${shortDay(d.day)}: ${d.gate} pay + CV, ${d.vitals} all vitals, ${d.full} fully complete`}>
                <div className={`w-full rounded-t ${d.gate > 0 ? "bg-teal-500" : "bg-slate-100 dark:bg-slate-800"}`} style={{ height: `${d.gate > 0 ? Math.max(6, (d.gate / max) * 100) : 4}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10.5px] text-slate-400"><span>{shortDay(days[0].day)}</span><span>{shortDay(days[days.length - 1].day)}</span></div>
        </div>
        <div>
          <p className="mb-1 text-[11.5px] text-slate-500">This month, by person</p>
          {trend.people.length === 0 ? (
            <p className="text-[12.5px] text-slate-400">Nobody has completed a profile yet this month.</p>
          ) : (
            <ul className="space-y-1.5">
              {trend.people.map((p) => (
                <li key={p.name} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="truncate text-slate-700 dark:text-slate-200">{p.name}</span>
                  <span className="shrink-0 tabular-nums text-slate-500"><b className="text-slate-900 dark:text-slate-100">{p.gate}</b> pay + CV · {p.full} full</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
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

export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ group?: string; by?: string; sub?: string; city?: string; gap?: string; strength?: string; mode?: string }> }) {
  const sp = await searchParams;
  const group = GROUPS.some((g) => g.key === sp.group) ? (sp.group as string) : "b2b_sales";
  const by = sp.by === "sub_domain" ? "sub_domain" : "sub_group";
  const sub = sp.sub ?? null; // a bucket name, or "*" for the whole group
  const city = sp.city ?? null;
  const gap = sp.gap && GAP_LABEL[sp.gap] ? sp.gap : null;
  const strength = sp.strength && STRENGTH[sp.strength] ? sp.strength : null;
  const mode = sp.mode === "assess" || sp.mode === "complete" || sp.mode === "confirm" || sp.mode === "vitals" ? sp.mode : "gate";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin", "recruiter", "partner", "freelancer"].includes(me.role)) redirect("/today");

  const [{ data: overview }, { data: targetRows }, { count: openQuestions }, { data: trendData }] = await Promise.all([
    supabase.rpc("completion_overview", { p_by: by }),
    supabase.from("completion_targets").select("profile_group, by_field, bucket, due_on, baseline_incomplete").eq("by_field", by),
    supabase.from("bot_questions").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.rpc("completion_trend", { p_group: ["b2b_sales", "b2c_sales", "non_sales"].includes(group) ? group : null, p_days: 30 }),
  ]);
  const trend = (trendData ?? null) as Trend | null;
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

  const url = (o: Partial<{ group: string; by: string; sub: string | null; city: string | null; gap: string | null; strength: string | null; mode: string }>) => {
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
    return `/candidates/complete?${q.toString()}`;
  };

  const priorityView = sub === "priority";
  const working = sub !== null;
  const bucketKey = sub && sub !== "*" && !priorityView ? sub : null;
  const focusRow = working && !priorityView ? (bucketKey ? groupRows.find((r) => r.bucket === bucketKey) : { ...sum(groupRows), profile_group: group, bucket: "*", gaps: groupGaps, strengths: groupStrengths[group] ?? {} }) : null;

  // Cities: inside the chosen practice when working, otherwise across the whole group.
  const { data: cityData } = await supabase.rpc("completion_cities", { p_group: group, p_by: by, p_bucket: bucketKey });
  const cities = ((cityData ?? []) as City[]).filter((c) => c.incomplete > 0).sort((a, b) => b.incomplete - a.incomplete).slice(0, 14);

  // Turns queue rows (ids in order, with their gaps and strength) into people the call desk can show.
  type QueueRow = { id: string; gaps: string[]; strength: string; why: string[] };
  const hydrate = async (q: QueueRow[]): Promise<CallPerson[]> => {
    if (q.length === 0) return [];
    const ids = q.map((x) => x.id);
    const [{ data: callRows }, { data: extra }] = await Promise.all([
      supabase.rpc("calls_for_candidates", { p_ids: ids }),
      supabase.from("candidates").select("id, email, profile_group, sub_domain").in("id", ids),
    ]);
    const ex = new Map(((extra ?? []) as { id: string; email: string | null; profile_group: string | null; sub_domain: string | null }[]).map((e) => [e.id, e]));
    const meta = new Map(q.map((x) => [x.id, x]));
    const byId = new Map(((callRows ?? []) as CallPerson[]).map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is CallPerson => !!p)
      .map((p) => {
        const m = meta.get(p.id)!;
        const gaps = [...m.gaps.filter(isGate), ...m.gaps.filter((g) => isVital(g) && !isGate(g)), ...m.gaps.filter((g) => !isVital(g))];
        return { ...p, resume_url: null, reason: "details_missing" as const, gaps, strength: m.strength, why: m.why ?? [], email: ex.get(p.id)?.email ?? null, profile_group: ex.get(p.id)?.profile_group ?? null, sub_domain: ex.get(p.id)?.sub_domain ?? null };
      });
  };

  let people: CallPerson[] = [];
  let queueError: string | null = null;
  const priority = !sub || priorityView ? await loadPriorityCalls(supabase) : null;
  if (priorityView) {
    // Today's calls: the priority people first, then everyone missing vitals, B2B first.
    const { data: queue, error } = await supabase.rpc("completion_queue", { p_group: null, p_by: by, p_mode: mode, p_limit: 60 });
    if (error) queueError = error.message;
    const rest = await hydrate((queue ?? []) as QueueRow[]);
    // Priority people come from other lists, so they need the email, domain and sub-domain the call form asks for.
    const { data: extra } = priority!.people.length ? await supabase.from("candidates").select("id, email, profile_group, sub_domain").in("id", priority!.people.map((p) => p.id)) : { data: [] };
    const ex = new Map(((extra ?? []) as { id: string; email: string | null; profile_group: string | null; sub_domain: string | null }[]).map((e) => [e.id, e]));
    const prio = priority!.people.map((p) => ({ ...p, email: ex.get(p.id)?.email ?? null, profile_group: ex.get(p.id)?.profile_group ?? null, sub_domain: ex.get(p.id)?.sub_domain ?? null }));
    const seen = new Set(prio.map((p) => p.id));
    people = [...prio, ...rest.filter((p) => !seen.has(p.id))];
  } else if (working && focusRow && (mode === "assess" ? focusRow.total - focusRow.assessed > 0 : mode === "confirm" ? focusRow.total - focusRow.looking_known > 0 : mode === "complete" ? focusRow.incomplete > 0 : mode === "vitals" ? focusRow.vitals_incomplete > 0 : focusRow.gate_incomplete > 0)) {
    const { data: queue, error } = await supabase.rpc("completion_queue", { p_group: group, p_by: by, p_bucket: bucketKey, p_city: city, p_gap: gap, p_strength: strength, p_mode: mode, p_limit: 50 });
    if (error) queueError = error.message;
    people = await hydrate((queue ?? []) as QueueRow[]);
  }

  // Calls made today, for the strip above the call list.
  const dayStart = istDayStartIso();
  const { data: todaysCalls } = working ? await supabase.from("call_log").select("caller_id, outcome").gte("created_at", dayStart).limit(2000) : { data: [] };
  const mine = ((todaysCalls ?? []) as { caller_id: string | null; outcome: string }[]).filter((l) => l.caller_id === user.id).length;
  const teamCalls = (todaysCalls ?? []) as { outcome: string }[];

  const focusGapEntries = focusRow ? Object.entries(focusRow.gaps).sort((a, b) => Number(isGate(b[0])) - Number(isGate(a[0])) || Number(isVital(b[0])) - Number(isVital(a[0])) || b[1] - a[1]) : [];
  const focusTarget = focusRow ? targets.get(`${group}|${focusRow.bucket}`) ?? null : null;

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-8 max-md:px-3">
      <CandidatesSubNav />
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Profile completion</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500 dark:text-slate-400">
            A profile is complete when it has everything needed to present the person to a client: name, phone, email, CV, experience, current and expected pay, notice period,
            city, relocation, domain, sub-domain, role level, company and job title. Current pay and a CV come before everything: without them a profile cannot be used. Then the vitals (current pay, city, role level and type, relocation, domain, sub-domain, CV, plus the basics); expected pay, notice period and the rest come after. Whether someone is looking for a change is asked on every call and counted separately, because it goes stale after 90 days.
          </p>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <span className="text-slate-500">Group practices by</span>
          {BY.map((b) => (
            <Link key={b.key} href={url({ by: b.key, sub: null })} className={`rounded-full border px-3 py-1 font-medium ${by === b.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
              {b.label}
            </Link>
          ))}
        </div>
      </div>

      {!working && priority && priority.people.length > 0 && (
        <Link href={url({ sub: "priority", city: null, gap: null })} className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 hover:bg-teal-100 dark:border-teal-900 dark:bg-teal-950/30 dark:hover:bg-teal-950/50">
          <span className="text-[13.5px] text-teal-900 dark:text-teal-100">
            <b>{priority.people.length} priority {priority.people.length === 1 ? "call" : "calls"} waiting</b>
            {priority.counts.paid > 0 && ` · ${priority.counts.paid} paid ₹199`}
            {priority.counts.interested > 0 && ` · ${priority.counts.interested} said yes to a role`}
            {priority.counts.callbacks > 0 && ` · ${priority.counts.callbacks} call-backs due`}
            {priority.counts.urgent > 0 && ` · ${priority.counts.urgent} for an urgent role`}
          </span>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-teal-800 dark:text-teal-200">Start today&apos;s calls <ArrowRight className="h-4 w-4" /></span>
        </Link>
      )}
      {!working && priority && priority.people.length === 0 && (
        <Link href={url({ sub: "priority", city: null, gap: null })} className="mb-4 inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
          Start today&apos;s calls (missing current pay or CV first) <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}

      {/* The whole base, split by group. */}
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
              <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Vitals</p>
              <Bar done={s.total - s.vitals_incomplete} total={s.total} tone={s.vitals_incomplete === 0 ? "bg-emerald-500" : "bg-teal-500"} />
              <p className="mt-1.5 flex justify-between text-[12.5px]">
                <span className="text-emerald-700 dark:text-emerald-300">{n0(s.total - s.vitals_incomplete)} complete</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">{n0(s.vitals_incomplete)} to go</span>
              </p>
              <p className="mt-1 text-[11.5px] text-slate-500">{n0(s.complete)} fully complete (vitals + other details) · {n0(s.looking_known)} confirmed looking</p>
              <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-slate-400">Profile strength · {n0(s.assessed)} judged on a call</p>
              <StrengthBar s={groupStrengths[g.key] ?? {}} total={s.total} />
            </Link>
          );
        })}
      </div>

      {!working && trend && trend.days.length > 0 && <TrendCard trend={trend} label={GROUP_LABEL[group] ?? "All"} />}

      {!working ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{GROUP_LABEL[group]}: {n0(byGroup[group].gate_incomplete)} profiles missing current pay or CV · {n0(byGroup[group].vitals_incomplete)} missing a vital</h2>
              {byGroup[group].gate_incomplete > 0 && (
                <Link href={url({ sub: "*" })} className="inline-flex items-center gap-1 rounded-full bg-teal-600 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700">
                  Work on all of {GROUP_LABEL[group]} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            {groupRows.length === 0 ? (
              <p className={`${card} p-6 text-[14px] text-slate-500`}>No profiles in this group yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {groupRows.map((r) => {
                  const top = Object.entries(r.gaps).sort((a, b) => Number(isGate(b[0])) - Number(isGate(a[0])) || Number(isVital(b[0])) - Number(isVital(a[0])) || b[1] - a[1]).slice(0, 5);
                  const target = targets.get(`${group}|${r.bucket}`) ?? null;
                  return (
                    <li key={r.bucket} className={`${card} p-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                        <div className="min-w-0 flex-1 basis-64">
                          <p className="text-[14.5px] font-semibold text-slate-900 dark:text-slate-100">{bucketLabel(r.bucket)}</p>
                          <p className="mt-0.5 text-[12.5px] text-slate-500">
                            {n0(r.total)} profiles · pay + CV <b className="text-rose-700 dark:text-rose-300">{n0(r.gate_incomplete)} to go</b> · vitals <span className="text-emerald-700 dark:text-emerald-300">{n0(r.total - r.vitals_incomplete)} complete</span> · <b className="text-amber-700 dark:text-amber-300">{n0(r.vitals_incomplete)} to go</b> · {n0(r.complete)} fully complete
                            {r.no_phone > 0 && <span> · {r.no_phone} have no usable phone</span>}
                          </p>
                          <div className="mt-2"><Bar done={r.total - r.vitals_incomplete} total={r.total} tone={r.vitals_incomplete === 0 ? "bg-emerald-500" : "bg-teal-500"} /></div>
                          <div className="mt-2.5 max-w-xl">
                            <StrengthBar s={r.strengths} total={r.total} />
                            <p className="mt-0.5 text-[11px] text-slate-400">
                              {r.assessed} of {r.total} judged on a call
                              {r.total - r.assessed > 0 && <> · <Link href={url({ sub: r.bucket, mode: "assess" })} className="font-medium text-teal-700 hover:underline dark:text-teal-300">assess the rest</Link></>}
                            </p>
                          </div>
                          {top.length > 0 && (
                            <p className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
                              {top.map(([k, v]) => (
                                <Link key={k} href={url({ sub: r.bucket, gap: k })} className={`rounded-full px-2 py-0.5 font-medium ${isGate(k) ? "bg-rose-50 text-rose-800 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-200" : isVital(k) ? "bg-amber-50 text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
                                  {GAP_LABEL[k] ?? k} · {v}
                                </Link>
                              ))}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                          {r.gate_incomplete > 0 && <TargetControl group={group} by={by} bucket={r.bucket} incomplete={r.gate_incomplete} target={target} compact />}
                          {r.gate_incomplete > 0 ? (
                            <Link href={url({ sub: r.bucket })} className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900">
                              Start calling <ArrowRight className="h-3.5 w-3.5" />
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
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Where the gaps are in {GROUP_LABEL[group]}</h3>
              {([{ title: "Vitals", test: true }, { title: "Other details", test: false }] as const).map((part) => (
                <div key={part.title} className="mt-2">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{part.title}</p>
                  <ul className="mt-1 space-y-1.5">
                    {Object.entries(groupGaps).filter(([k]) => isVital(k) === part.test).sort((a, b) => Number(isGate(b[0])) - Number(isGate(a[0])) || b[1] - a[1]).map(([k, v]) => (
                      <li key={k}>
                        <Link href={url({ sub: "*", gap: k, mode: part.test ? "vitals" : "complete" })} className="flex items-center justify-between gap-2 text-[12.5px] hover:underline">
                          <span className="text-slate-600 dark:text-slate-300">Missing {GAP_LABEL[k] ?? k}</span>
                          <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{n0(v)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
            <section className={`${card} p-4`}>
              <h3 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">Incomplete profiles by city</h3>
              <p className="text-[11.5px] text-slate-500">They cannot come up in matching for a role in that city until completed.</p>
              <ul className="mt-2 space-y-1.5">
                {cities.map((c) => (
                  <li key={c.city}>
                    <Link href={url({ sub: "*", city: c.city })} className="block hover:opacity-80">
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
              <ArrowLeft className="h-3.5 w-3.5" /> {priorityView ? "Profile completion" : `All ${GROUP_LABEL[group]} practices`}
            </Link>
          </div>
          {priorityView && priority && (
            <div className={`${card} mb-4 p-4`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-[17px] font-semibold text-slate-900 dark:text-slate-100">Today&apos;s calls</h2>
                  <p className="mt-0.5 max-w-3xl text-[13px] text-slate-500">
                    Priority first: {priority.counts.paid} paid ₹199 {priority.counts.paid === 1 ? "call" : "calls"} (soonest deadline first), {priority.counts.interested} who said yes to a role, {priority.counts.callbacks} call-backs due and {priority.counts.urgent} matching an urgent role. Then everyone missing current pay or a CV, B2B first, then B2C, then the rest.
                    {priority.urgentRoles.length > 0 && ` Urgent: ${priority.urgentRoles.map((r) => r.title).join(", ")}.`}
                  </p>
                </div>
                <div className="text-right text-[12.5px] text-slate-500">
                  <p><span className="text-[22px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{mine}</span> calls by you today</p>
                  <p>Team today: {teamCalls.length} calls, {teamCalls.filter((l) => l.outcome === "reached").length} reached</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">After the priority people:</span>
                {([{ k: "gate", l: "Current pay + CV" }, { k: "vitals", l: "Missing vitals" }, { k: "complete", l: "Missing anything" }, { k: "confirm", l: "Confirm looking" }, { k: "assess", l: "Judge on a call" }] as const).map((m) => (
                  <Link key={m.k} href={url({ sub: "priority", mode: m.k })} className={`rounded-full border px-3 py-0.5 font-medium ${mode === m.k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>{m.l}</Link>
                ))}
              </div>
            </div>
          )}
          {focusRow && (
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
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px]">
                <span className="font-medium text-slate-500">Call list:</span>
                {([{ k: "gate", l: "Current pay + CV", n: focusRow.gate_incomplete }, { k: "vitals", l: "Fill vitals", n: focusRow.vitals_incomplete }, { k: "complete", l: "Other details", n: focusRow.incomplete }, { k: "confirm", l: "Confirm looking", n: focusRow.total - focusRow.looking_known }, { k: "assess", l: "Judge on a call", n: focusRow.total - focusRow.assessed }] as const).map((m) => (
                  <Link key={m.k} href={url({ mode: m.k })} className={`rounded-full border px-3 py-0.5 font-medium ${mode === m.k ? "border-teal-600 bg-teal-600 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`}>
                    {m.l} · {n0(m.n)}
                  </Link>
                ))}
                <span className="text-slate-400">{{ gate: "Current pay or CV missing: nothing else can be done with these profiles until they are on file. Fewest other gaps first.", vitals: "Missing vitals first (pay, city, level, relocation, domain, CV), fewest gaps first.", complete: "Everyone still missing anything, vitals gaps first.", confirm: "Not known whether they are looking for a change. Strongest first.", assess: "Nobody has rated their communication yet. Rate it on the call; strength follows." }[mode]}</span>
              </div>
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
                The {people.length} people who can be called now{mode === "assess" || mode === "confirm" ? ", strongest on paper first" : ", current pay and CV first, then vitals, fewest gaps first so profiles actually reach complete"}. Call, fill in what is missing, rate how they came across, pick the result; the next person opens by itself.
                People who didn&apos;t answer come back after a day, up to 3 tries.
              </p>
              <CallsDesk key={`${group}|${by}|${sub}|${city}|${gap}|${strength}|${mode}`} people={people} />
            </>
          )}
        </div>
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
