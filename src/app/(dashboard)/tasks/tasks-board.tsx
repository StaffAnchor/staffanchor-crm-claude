"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Briefcase, CalendarClock, CheckCircle2, ChevronDown, CircleDot, ClipboardList, Hourglass, PhoneCall, Search, Send, Settings2, Sparkles, UserCheck } from "lucide-react";
import { BACKLOG_AFTER_DAYS, KIND_LABEL, SLA_DAYS, isMine, type PacketKind, type TaskBoard, type TaskPacket } from "@/lib/task-packets";

const KIND_ICON: Record<PacketKind, typeof Send> = {
  review_applicants: UserCheck,
  send_shortlist: Send,
  chase_client: Hourglass,
  coordinate_interviews: CalendarClock,
  second_round_calls: PhoneCall,
  record_assessment: ClipboardList,
  new_matches: Sparkles,
  setup_role: Settings2,
  sales_followups: Briefcase,
  other: CircleDot,
};

type Bucket = "late" | "due" | "ok" | "backlog";
const bucketOf = (p: TaskPacket): Bucket => (p.backlog ? "backlog" : p.state === "overdue" ? "late" : p.state === "due" ? "due" : "ok");

const BUCKET: Record<Bucket, { label: string; hint: string; bar: string; dot: string; tile: string }> = {
  late: { label: "Late", hint: "Past its deadline. Do these first.", bar: "bg-rose-500", dot: "bg-rose-500", tile: "text-rose-700 dark:text-rose-300" },
  due: { label: "Due soon", hint: "Half way to the deadline.", bar: "bg-amber-400", dot: "bg-amber-400", tile: "text-amber-700 dark:text-amber-300" },
  ok: { label: "On track", hint: "Fresh work, no rush yet.", bar: "bg-emerald-500", dot: "bg-emerald-500", tile: "text-emerald-700 dark:text-emerald-300" },
  backlog: { label: "Backlog", hint: `A month or more late. Look at these once, then clear or park them.`, bar: "bg-slate-300 dark:bg-slate-600", dot: "bg-slate-400", tile: "text-slate-600 dark:text-slate-300" },
};

const card = "rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm";

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function slaText(p: TaskPacket): { text: string; cls: string } {
  if (p.state === "overdue") return { text: `Late by ${p.overdueByDays} ${p.overdueByDays === 1 ? "day" : "days"}`, cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" };
  if (p.state === "due") return { text: p.oldestDays >= p.slaDays ? "Due today" : `Due in ${Math.max(1, p.slaDays - p.oldestDays)} ${p.slaDays - p.oldestDays === 1 ? "day" : "days"}`, cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" };
  return { text: `${Math.max(1, p.slaDays - p.oldestDays)} days left`, cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" };
}

function PacketCard({ p }: { p: TaskPacket }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[p.kind];
  const b = BUCKET[bucketOf(p)];
  const sla = slaText(p);
  const preview = p.items.slice(0, 3).map((i) => i.label).join(", ");
  const extra = p.count - Math.min(3, p.items.length);

  return (
    <li className={`${card} overflow-hidden`}>
      <div className="flex">
        <div className={`w-1 shrink-0 ${b.bar}`} aria-hidden />
        <div className="flex-1 min-w-0 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">{p.title}</h3>
              <p className="text-[13px] text-slate-500 dark:text-slate-400 truncate">{p.context}</p>
            </div>
            <Link
              href={p.primary.href}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-[13px] font-medium px-3.5 py-2 hover:bg-slate-800 dark:hover:bg-white ros-focusable"
            >
              {p.primary.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 pl-12 text-[12px]">
            <span className={`rounded-full px-2.5 py-0.5 font-medium ${sla.cls}`}>{sla.text}</span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-slate-600 dark:text-slate-300">
              Waiting {p.oldestDays} {p.oldestDays === 1 ? "day" : "days"}
            </span>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-slate-600 dark:text-slate-300">Deadline {p.slaDays} {p.slaDays === 1 ? "day" : "days"}</span>
            <span className="ml-auto flex items-center gap-1.5 text-slate-500 dark:text-slate-400" title={p.owners.map((o) => o.name).join(", ") || "Nobody assigned yet"}>
              {p.owners.length === 0 ? (
                <span className="rounded-full border border-dashed border-slate-300 dark:border-slate-600 px-2 py-0.5">Unassigned</span>
              ) : (
                <>
                  {p.owners.slice(0, 3).map((o) => (
                    <span key={o.id} className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-50 dark:bg-teal-950/40 text-[10.5px] font-semibold text-teal-800 dark:text-teal-200">
                      {initials(o.name)}
                    </span>
                  ))}
                  <span className="max-w-[140px] truncate">{p.owners.map((o) => o.name.split(" ")[0]).join(", ")}</span>
                </>
              )}
            </span>
          </div>

          {p.items.length > 0 && (
            <div className="mt-2.5 pl-12">
              <button onClick={() => setOpen((o) => !o)} className="group flex w-full items-center gap-1.5 text-left text-[12.5px] text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200">
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
                <span className="truncate">
                  {preview}
                  {extra > 0 ? ` and ${extra} more` : ""}
                </span>
              </button>
              {open && (
                <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800">
                  {p.items.map((it, i) => (
                    <li key={i}>
                      <Link href={it.href} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800/60">
                        <span className="min-w-0">
                          <span className="block truncate text-slate-800 dark:text-slate-200">{it.label}</span>
                          {it.sub ? <span className="block truncate text-[12px] text-slate-500 dark:text-slate-400">{it.sub}</span> : null}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                      </Link>
                    </li>
                  ))}
                  {p.moreItems > 0 && <li className="px-3 py-2 text-[12px] text-slate-500 dark:text-slate-400">and {p.moreItems} more. Open the screen above to see everyone.</li>}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Ring({ done, remaining }: { done: number; remaining: number }) {
  const total = done + remaining;
  const pct = total === 0 ? 1 : done / total;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-[68px] w-[68px] shrink-0" role="img" aria-label={`${done} cleared today, ${remaining} to go`}>
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <circle cx="34" cy="34" r={r} fill="none" strokeWidth="7" className="stroke-slate-100 dark:stroke-slate-800" />
        <circle cx="34" cy="34" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} className="stroke-teal-600" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[17px] font-semibold text-slate-900 dark:text-slate-100 tabular-nums">{done}</span>
        <span className="mt-0.5 text-[9.5px] uppercase tracking-wide text-slate-400">today</span>
      </div>
    </div>
  );
}

export default function TasksBoard({ board, userId }: { board: TaskBoard; userId: string }) {
  const [scope, setScope] = useState<"mine" | "everyone">("mine");
  const [bucket, setBucket] = useState<Bucket | "all">("all");
  const [kinds, setKinds] = useState<Set<PacketKind>>(new Set());
  const [query, setQuery] = useState("");
  const [showBacklog, setShowBacklog] = useState(false);

  const inScope = useMemo(() => board.packets.filter((p) => (scope === "everyone" ? true : isMine(p, userId))), [board.packets, scope, userId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inScope.filter((p) => (kinds.size === 0 || kinds.has(p.kind)) && (!q || `${p.title} ${p.context}`.toLowerCase().includes(q)) && (bucket === "all" || bucketOf(p) === bucket));
  }, [inScope, kinds, query, bucket]);

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { late: 0, due: 0, ok: 0, backlog: 0 };
    for (const p of inScope) c[bucketOf(p)]++;
    return c;
  }, [inScope]);

  const kindCounts = useMemo(() => {
    const m = new Map<PacketKind, number>();
    for (const p of inScope) m.set(p.kind, (m.get(p.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inScope]);

  const grouped = useMemo(() => {
    const g: Record<Bucket, TaskPacket[]> = { late: [], due: [], ok: [], backlog: [] };
    for (const p of visible) g[bucketOf(p)].push(p);
    return g;
  }, [visible]);

  const team = useMemo(() => {
    const m = new Map<string, { name: string; total: number; late: number }>();
    for (const p of board.packets) {
      if (p.backlog) continue;
      const owners = p.owners.length ? p.owners : [{ id: "none", name: "Unassigned" }];
      for (const o of owners) {
        const e = m.get(o.id) ?? { name: o.name, total: 0, late: 0 };
        e.total++;
        if (p.state === "overdue") e.late++;
        m.set(o.id, e);
      }
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [board.packets]);
  const teamMax = Math.max(1, ...team.map((t) => t.total));

  const active = counts.late + counts.due + counts.ok;
  const toggleKind = (k: PacketKind) =>
    setKinds((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const sections: Bucket[] = ["late", "due", "ok"];
  const tiles: { b: Bucket; label: string }[] = [
    { b: "late", label: "Late" },
    { b: "due", label: "Due soon" },
    { b: "ok", label: "On track" },
    { b: "backlog", label: "Backlog" },
  ];

  return (
    <div className="max-w-[1280px] mx-auto px-5 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">Tasks</h1>
          <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
            {active === 0 ? "You're clear. Nothing is waiting on you." : `${active} to do${counts.late > 0 ? `, ${counts.late} late` : ""}.`} Each task is one role and one job, with a deadline and a button that does the work.
          </p>
        </div>
        <Ring done={board.doneToday} remaining={counts.late + counts.due} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {tiles.map(({ b, label }) => {
          const on = bucket === b;
          return (
            <button
              key={b}
              onClick={() => setBucket(on ? "all" : b)}
              className={`${card} p-4 text-left transition-colors hover:border-slate-300 dark:hover:border-slate-600 ${on ? "ring-2 ring-teal-600" : ""}`}
              aria-pressed={on}
            >
              <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
                <span className={`h-2 w-2 rounded-full ${BUCKET[b].dot}`} aria-hidden />
                {label}
              </div>
              <p className={`mt-1.5 text-[28px] leading-none font-semibold tabular-nums ${BUCKET[b].tile}`}>{counts[b]}</p>
            </button>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[13px]" role="group" aria-label="Whose tasks">
              {(["mine", "everyone"] as const).map((s) => (
                <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s} className={`px-3 py-1.5 rounded-md font-medium ${scope === s ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 dark:text-slate-300"}`}>
                  {s === "mine" ? "Mine" : "Everyone"}
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role or client" className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-8 pr-3 py-2 text-[13px]" aria-label="Search tasks" />
            </div>
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {kindCounts.map(([k, n]) => {
              const on = kinds.has(k);
              const Icon = KIND_ICON[k];
              return (
                <button key={k} onClick={() => toggleKind(k)} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] ${on ? "border-teal-600 bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200" : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {KIND_LABEL[k]} <span className="tabular-nums text-slate-400">{n}</span>
                </button>
              );
            })}
            {kinds.size > 0 && (
              <button onClick={() => setKinds(new Set())} className="px-2 text-[12.5px] text-slate-500 dark:text-slate-400 underline">
                Clear
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <div className={`${card} flex flex-col items-center gap-2 px-6 py-14 text-center`}>
              <CheckCircle2 className="h-8 w-8 text-emerald-600" aria-hidden />
              <p className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{inScope.length === 0 ? "You're clear" : "Nothing matches these filters"}</p>
              <p className="text-[13px] text-slate-500 dark:text-slate-400">{inScope.length === 0 ? "No task is waiting on you right now." : "Clear a filter to see more."}</p>
            </div>
          ) : (
            <div className="space-y-7">
              {sections.map((s) =>
                grouped[s].length === 0 ? null : (
                  <section key={s} aria-labelledby={`sec-${s}`}>
                    <div className="mb-2.5 flex items-baseline gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${BUCKET[s].dot}`} aria-hidden />
                      <h2 id={`sec-${s}`} className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                        {BUCKET[s].label} <span className="font-normal text-slate-400 tabular-nums">{grouped[s].length}</span>
                      </h2>
                      <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{BUCKET[s].hint}</p>
                    </div>
                    <ul className="space-y-3">
                      {grouped[s].map((p) => (
                        <PacketCard key={p.id} p={p} />
                      ))}
                    </ul>
                  </section>
                )
              )}

              {grouped.backlog.length > 0 && (
                <section aria-labelledby="sec-backlog">
                  <button onClick={() => setShowBacklog((v) => !v)} className="mb-2.5 flex w-full items-baseline gap-2 text-left" aria-expanded={showBacklog || bucket === "backlog"}>
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden />
                    <h2 id="sec-backlog" className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">
                      Backlog <span className="font-normal text-slate-400 tabular-nums">{grouped.backlog.length}</span>
                    </h2>
                    <p className="text-[12.5px] text-slate-500 dark:text-slate-400">{BUCKET.backlog.hint}</p>
                    <ChevronDown className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${showBacklog || bucket === "backlog" ? "rotate-180" : ""}`} aria-hidden />
                  </button>
                  {(showBacklog || bucket === "backlog") && (
                    <ul className="space-y-3">
                      {grouped.backlog.map((p) => (
                        <PacketCard key={p.id} p={p} />
                      ))}
                    </ul>
                  )}
                </section>
              )}
            </div>
          )}
        </div>

        <aside className="space-y-5 min-w-0">
          <section className={`${card} p-4`}>
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Team load</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">Open tasks per person, late ones in red. Backlog not counted.</p>
            {team.length === 0 ? (
              <p className="text-[13px] text-slate-500 dark:text-slate-400">No open tasks.</p>
            ) : (
              <ul className="space-y-3">
                {team.map((t) => (
                  <li key={t.name}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="text-slate-800 dark:text-slate-200 truncate">{t.name}</span>
                      <span className="tabular-nums text-slate-500 dark:text-slate-400">
                        {t.total}
                        {t.late > 0 ? <span className="text-rose-600"> · {t.late} late</span> : null}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="flex h-full" style={{ width: `${(t.total / teamMax) * 100}%` }}>
                        <div className="h-full bg-rose-500" style={{ width: `${t.total ? (t.late / t.total) * 100 : 0}%` }} />
                        <div className="h-full flex-1 bg-teal-600" />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={`${card} p-4`}>
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Deadlines</h2>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">How long each kind of work may wait.</p>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-[13px]">
              {(Object.keys(SLA_DAYS) as PacketKind[])
                .filter((k) => k !== "other")
                .map((k) => (
                  <li key={k} className="flex justify-between py-1.5">
                    <span className="text-slate-700 dark:text-slate-300">{KIND_LABEL[k]}</span>
                    <span className="tabular-nums text-slate-500 dark:text-slate-400">
                      {SLA_DAYS[k]} {SLA_DAYS[k] === 1 ? "day" : "days"}
                    </span>
                  </li>
                ))}
            </ul>
            <p className="mt-2 text-[12px] text-slate-500 dark:text-slate-400">A task a month past its deadline moves to Backlog ({BACKLOG_AFTER_DAYS}+ days late).</p>
          </section>

          <section className={`${card} p-4`}>
            <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">What the system handles</h2>
            <ul className="mt-2 space-y-2 text-[13px] text-slate-600 dark:text-slate-300">
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">{board.automated.groupedFrom}</span> one-by-one reminders are now <span className="font-medium text-slate-800 dark:text-slate-200">{board.automated.packetsFromThem}</span> tasks, one per role.
              </li>
              <li>
                <span className="font-medium text-slate-800 dark:text-slate-200">{board.automated.remindersHandled}</span> profile and stale-candidate reminders are no longer shown. They are for the system to handle.
              </li>
              <li>Tasks close themselves when the pipeline moves, so there is nothing to tick off.</li>
            </ul>
            <Link href="/inbox" className="mt-3 inline-block text-[12.5px] text-slate-500 dark:text-slate-400 underline hover:text-slate-800 dark:hover:text-slate-200">
              Open the old task list
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
