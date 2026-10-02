import Link from "next/link";
import { ArrowRight, CalendarClock, Hourglass, Handshake, Trophy, CheckCircle2, ListChecks } from "lucide-react";
import type { Decision, NextUp, RoleHealth, RoleRow, TodayDesk, Tone } from "@/lib/today-desk";

const card = "rounded-ros-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm";

const TONE_DOT: Record<Tone, string> = {
  urgent: "bg-rose-500",
  attention: "bg-amber-500",
  info: "bg-slate-400",
};

const HEALTH: Record<RoleHealth, { label: string; cls: string }> = {
  behind: { label: "Behind", cls: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" },
  slow: { label: "Slow", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" },
  ontrack: { label: "On track", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" },
};

function Tile({ icon: Icon, value, label, sub, warn }: { icon: typeof CalendarClock; value: string; label: string; sub?: string; warn?: boolean }) {
  return (
    <div className={`${card} p-4`}>
      <div className="flex items-center gap-2 text-[12px] text-slate-500 dark:text-slate-400">
        <Icon className={`h-4 w-4 ${warn ? "text-amber-600" : "text-teal-600"}`} aria-hidden />
        {label}
      </div>
      <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight text-slate-900 dark:text-slate-100">{value}</p>
      {sub ? <p className="mt-1.5 text-[12px] text-slate-500 dark:text-slate-400 truncate">{sub}</p> : null}
    </div>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  return (
    <li className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 py-3 border-t border-slate-100 dark:border-slate-800 first:border-t-0">
      <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
        <span className={`mt-1.5 sm:mt-0 h-2 w-2 rounded-full shrink-0 ${TONE_DOT[d.tone]}`} aria-label={d.tone} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 sm:truncate">{d.title}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 sm:truncate">{d.detail}</p>
        </div>
      </div>
      <Link
        href={d.href}
        className="shrink-0 self-start sm:self-auto ml-5 sm:ml-0 inline-flex items-center gap-1.5 rounded-ros-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[13px] font-medium text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800 ros-focusable"
      >
        {d.actionLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </li>
  );
}

function NextUpRow({ t }: { t: NextUp }) {
  return (
    <li className="border-t border-slate-100 dark:border-slate-800 first:border-t-0">
      <Link href={t.href} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ros-focusable">
        <span className={`h-2 w-2 rounded-full shrink-0 ${t.priority === "high" ? "bg-rose-500" : "bg-slate-400"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 truncate">{t.title}</p>
          {t.context ? <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">{t.context}</p> : null}
        </div>
        <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" aria-hidden />
      </Link>
    </li>
  );
}

function RoleLine({ r }: { r: RoleRow }) {
  const h = HEALTH[r.health];
  return (
    <li className="border-t border-slate-100 dark:border-slate-800 first:border-t-0">
      <Link
        href={`/mandates/${r.mandateId}`}
        className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,0.5fr))_minmax(0,1fr)] gap-x-3 gap-y-1 items-center px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 ros-focusable"
      >
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100 truncate">{r.role}</p>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
            {r.client} · open {r.daysOpen}d
            {r.setupNote ? <span className="sm:hidden text-violet-700 dark:text-violet-300"> · {r.setupNote}</span> : null}
          </p>
        </div>
        <div className="hidden sm:block text-[13px] tabular-nums text-slate-700 dark:text-slate-300">{r.inPipeline}</div>
        <div className="hidden sm:block text-[13px] tabular-nums text-slate-700 dark:text-slate-300">{r.unreviewed}</div>
        <div className="hidden sm:block text-[13px] tabular-nums text-slate-700 dark:text-slate-300">{r.sent}</div>
        <div className="hidden sm:block text-[13px] tabular-nums text-slate-700 dark:text-slate-300">{r.interviewing}</div>
        <div className="justify-self-end sm:justify-self-start">
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium ${h.cls}`}>{h.label}</span>
          <p className="hidden sm:block mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">{r.healthNote}</p>
          {r.setupNote ? <p className="hidden sm:block text-[11px] font-medium text-violet-700 dark:text-violet-300 truncate">{r.setupNote}</p> : null}
        </div>
      </Link>
    </li>
  );
}

export default function TodayView({ desk }: { desk: TodayDesk }) {
  const { metrics } = desk;
  const needCount = desk.decisions.length + desk.moreDecisions;
  const placements = metrics.placements;

  return (
    <div className="max-w-[1200px] mx-auto px-5 py-8">
      <div className="mb-6">
        <h1 className="text-[24px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {desk.greeting}, {desk.firstName}.
        </h1>
        <p className="mt-1 text-[14px] text-slate-500 dark:text-slate-400">
          {needCount === 0 ? "Nothing needs a decision from you right now." : `${needCount} ${needCount === 1 ? "thing needs" : "things need"} you today.`}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Tile
          icon={CalendarClock}
          label="Interviews today"
          value={String(metrics.interviewsToday.count)}
          sub={metrics.interviewsToday.names.slice(0, 2).join(", ") || "None scheduled"}
        />
        <Tile
          icon={Hourglass}
          label="Waiting on clients"
          value={String(metrics.waitingOnClients.links)}
          sub={metrics.waitingOnClients.links ? `${metrics.waitingOnClients.clients} ${metrics.waitingOnClients.clients === 1 ? "role" : "roles"}, 5+ days quiet` : "No one is overdue"}
          warn={metrics.waitingOnClients.links > 0}
        />
        <Tile icon={Handshake} label="Offers open" value={String(metrics.offersOpen)} sub={metrics.offersOpen ? "Close or follow up" : "No offers pending"} />
        <Tile
          icon={Trophy}
          label="Placements this month"
          value={placements.target != null ? `${placements.done} / ${placements.target}` : String(placements.done)}
          sub={placements.target != null ? "Against this month's target" : "No target set"}
        />
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5 items-start">
        <div className="space-y-5 min-w-0">
          <section className={card}>
            <header className="px-4 pt-4 pb-3">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Needs a decision</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">One item per role, most important first.</p>
            </header>
            {desk.decisions.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 border-t border-slate-100 dark:border-slate-800 text-[14px] text-slate-600 dark:text-slate-300">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                All roles are set up and moving.
              </div>
            ) : (
              <ul>
                {desk.decisions.map((d) => (
                  <DecisionRow key={d.id} d={d} />
                ))}
              </ul>
            )}
            {desk.moreDecisions > 0 ? (
              <p className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[12px] text-slate-500 dark:text-slate-400">
                {desk.moreDecisions} more {desk.moreDecisions === 1 ? "role needs" : "roles need"} attention. See the table below.
              </p>
            ) : null}
          </section>

          <section className={card}>
            <header className="px-4 pt-4 pb-3">
              <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Roles at a glance</h2>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Every open role, stuck ones first.</p>
            </header>
            {desk.roles.length === 0 ? (
              <p className="px-4 py-6 border-t border-slate-100 dark:border-slate-800 text-[14px] text-slate-600 dark:text-slate-300">No open roles.</p>
            ) : (
              <>
                <div className="hidden sm:grid grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,0.5fr))_minmax(0,1fr)] gap-x-3 px-4 py-2 border-t border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wide text-slate-400">
                  <span>Role</span>
                  <span>Pipeline</span>
                  <span>Unseen</span>
                  <span>Sent</span>
                  <span>Interview</span>
                  <span>Health</span>
                </div>
                <ul>
                  {desk.roles.map((r) => (
                    <RoleLine key={r.mandateId} r={r} />
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        <aside className="space-y-5 min-w-0">
          <section className={card}>
            <header className="px-4 pt-4 pb-3 flex items-baseline justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Next up for you</h2>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">Real tasks only, no bulk reminders.</p>
              </div>
            </header>
            {desk.nextUp.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-6 border-t border-slate-100 dark:border-slate-800 text-[14px] text-slate-600 dark:text-slate-300">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
                You're clear.
              </div>
            ) : (
              <ul>
                {desk.nextUp.map((t) => (
                  <NextUpRow key={t.id} t={t} />
                ))}
              </ul>
            )}
            <Link
              href="/inbox"
              className="flex items-center justify-between gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[13px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 rounded-b-ros-xl ros-focusable"
            >
              <span className="flex items-center gap-2">
                <ListChecks className="h-4 w-4" aria-hidden />
                {desk.moreNextUp > 0 ? `${desk.moreNextUp} more tasks` : "All tasks"}
                {desk.staleCount > 0 ? ` · ${desk.staleCount} old` : ""}
                {desk.routineCount > 0 ? ` · ${desk.routineCapped ? "1,000+" : desk.routineCount} routine` : ""}
              </span>
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
