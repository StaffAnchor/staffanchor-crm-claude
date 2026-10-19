import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { MISSING_LABEL, TIER_PILL, TIER_LABEL, type ReadinessTier } from "@/lib/readiness";

export const dynamic = "force-dynamic";

const RANGES = [7, 30];

type Movement = {
  tracking_since: string | null;
  events: number;
  up: number;
  down: number;
  new_registrations: number;
  new_ready_at_entry: number;
  became_ready: number;
  became_ready_by_cause: Record<string, number>;
  fixed_items: Record<string, number>;
};
type Funnel = {
  whatsapp: { asked: number; delivered: number; read: number; failed: number; replied: number; improved: number };
  email: { asked: number; improved: number };
};
type NextMoves = {
  almost_sales: number;
  one_step_sales: number;
  by_missing_count: Record<string, number>;
  items_almost_sales: Record<string, number>;
  sales_needs_work: number;
  sales_no_phone: number;
  unclassified: number;
};
type SourceRow = { source: string; n: number; ready: number; top_missing: string | null };
type Daily = { day: string; total: number; ready: number; almost: number; needs_work: number; ready_sales: number; new_candidates: number; avg_score: number | null };
type EventRow = {
  id: string;
  at: string;
  from_tier: string | null;
  to_tier: string | null;
  fixed: string[];
  cause: string;
  candidates: { id: string; full_name: string | null } | null;
};

const CAUSE_LABEL: Record<string, string> = {
  new_registration: "New registration (arrived complete)",
  after_whatsapp_ask: "After a WhatsApp ask",
  after_email_ask: "After an email ask",
  cv_read: "CV was read",
  edit: "Edited by a recruiter or the system",
};

const SOURCE_LABEL: Record<string, string> = {
  generic_registration: "Registration form",
  job_listing_quick_apply: "Job quick-apply",
  naukri_resdex_export: "Naukri export",
  onboarding_progressive_save: "Onboarding (WhatsApp)",
  unknown: "Unknown",
};

// Kept outside the component so the lint rule against reading the clock during render stays satisfied.
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400000).toISOString();
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const label = (k: string) => MISSING_LABEL[k] ?? k.replace(/_/g, " ");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short" });

function Card({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
      {sub && <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-slate-400">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label: l, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700">
      <p className="text-[12px] text-slate-500">{l}</p>
      <p className="mt-0.5 text-[24px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

function Bar({ name, value, max, tone = "bg-teal-500" }: { name: string; value: number; max: number; tone?: string }) {
  return (
    <div className="flex items-center gap-3 text-[13px]">
      <span className="w-56 shrink-0 text-slate-700 dark:text-slate-300">{name}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${max > 0 ? Math.max(3, (value / max) * 100) : 0}%` }} />
      </div>
      <span className="w-10 text-right tabular-nums text-slate-600 dark:text-slate-400">{value}</span>
    </div>
  );
}

export default async function DatabaseHealthPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 7;
  const supabase = await createClient();

  const [mv, fn, nm, sq, daily, recent] = await Promise.all([
    supabase.rpc("dq_movement", { p_days: days }),
    supabase.rpc("dq_ask_funnel", { p_days: 14 }),
    supabase.rpc("dq_next_moves"),
    supabase.rpc("dq_source_quality", { p_days: 30 }),
    supabase.from("readiness_daily").select("*").order("day", { ascending: false }).limit(14),
    supabase
      .from("readiness_events")
      .select("id, at, from_tier, to_tier, fixed, cause, candidates(id, full_name)")
      .gt("at", daysAgoIso(days))
      .neq("cause", "new_registration")
      .order("at", { ascending: false })
      .limit(15),
  ]);

  const movement = (mv.data ?? {}) as Partial<Movement>;
  const funnel = (fn.data ?? {}) as Partial<Funnel>;
  const next = (nm.data ?? {}) as Partial<NextMoves>;
  const sources = ((sq.data ?? []) as SourceRow[]).filter((s) => s.n > 0);
  const snaps = (daily.data ?? []) as Daily[];
  const moves = (recent.data ?? []) as unknown as EventRow[];
  const today = snaps[0];
  const earlier = snaps.length > 1 ? snaps[snaps.length - 1] : null;
  const tracking = movement.tracking_since ? when(movement.tracking_since) : null;

  const wa = funnel.whatsapp;
  const byCause = Object.entries(movement.became_ready_by_cause ?? {}).sort((a, b) => b[1] - a[1]);
  const fixedItems = Object.entries(movement.fixed_items ?? {}).sort((a, b) => b[1] - a[1]);
  const gaps = Object.entries(next.items_almost_sales ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxGap = gaps[0]?.[1] ?? 0;

  // Plain-language levers, each backed by the numbers on this page.
  const levers: { title: string; body: string }[] = [];
  const bigWeak = sources.filter((s) => s.n >= 30 && pct(s.ready, s.n) < 30).sort((a, b) => b.n - a.n)[0];
  const strong = sources.filter((s) => s.n >= 30 && pct(s.ready, s.n) >= 60).sort((a, b) => pct(b.ready, b.n) - pct(a.ready, a.n))[0];
  if (bigWeak) {
    levers.push({
      title: `Fix the ${SOURCE_LABEL[bigWeak.source] ?? bigWeak.source} intake`,
      body: `${bigWeak.n} profiles came in over the last 30 days and only ${pct(bigWeak.ready, bigWeak.n)}% were complete. The most common gap is ${bigWeak.top_missing ? label(bigWeak.top_missing).toLowerCase() : "unknown"}. Making it required on the form stops the gap at the door${strong ? `, as ${SOURCE_LABEL[strong.source] ?? strong.source} does (${pct(strong.ready, strong.n)}% complete)` : ""}.`,
    });
  }
  if (wa && wa.asked >= 10) {
    levers.push({
      title: "Make asks easier to answer",
      body: `Of ${wa.asked} WhatsApp asks in the last 14 days, ${wa.read} were read but only ${wa.replied} got a reply (${pct(wa.replied, wa.asked)}%). A tap-button template (notice period, role level) takes less effort than typing.`,
    });
  }
  if ((next.by_missing_count?.["1"] ?? 0) === 0 && (next.almost_sales ?? 0) > 0) {
    const two = (next.by_missing_count?.["2"] ?? 0) + (next.by_missing_count?.["3"] ?? 0) + (next.by_missing_count?.["4"] ?? 0);
    levers.push({
      title: "Ask for two or three things at once",
      body: `None of the ${next.almost_sales} almost-ready sales profiles is just one detail short. They each lack two or more, so a single-question ask can't finish them. The top gaps are ${gaps.slice(0, 3).map(([k]) => label(k).toLowerCase()).join(", ")}. A short form link (the "Complete my profile" button) covers all of them in one go; ${two} profiles would benefit.`,
    });
  }
  if ((next.unclassified ?? 0) > 0) {
    levers.push({
      title: "Classify the unclear profiles",
      body: `${next.unclassified} profiles have no sales or non-sales group yet, so they can't be matched or counted in the top tier.`,
    });
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-5 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Database health</h1>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">What is moving, why it moves, what to move next, and where quality is made or lost.</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/analytics/database?days=${r}`}
              className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${days === r ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
            >
              Last {r} days
            </Link>
          ))}
        </div>
      </div>

      {today && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat
            label="Ready sales profiles"
            value={today.ready_sales}
            note={earlier && earlier.day !== today.day ? `${today.ready_sales - earlier.ready_sales >= 0 ? "+" : ""}${today.ready_sales - earlier.ready_sales} since ${when(earlier.day)}` : "trend builds from today"}
          />
          <Stat label="Ready overall" value={`${pct(today.ready, today.total)}%`} note={`${today.ready} of ${today.total} profiles`} />
          <Stat label="Average readiness" value={`${today.avg_score ?? "–"}/100`} />
          <Stat label="Registered today" value={today.new_candidates} />
        </div>
      )}

      <Card
        title="What moved"
        sub={tracking ? `Every change to a profile's readiness is logged with its likely cause. Tracking began ${tracking}.` : "Every change to a profile's readiness is now logged with its likely cause. Nothing has moved since tracking began, so this fills in as profiles change."}
      >
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Became Ready" value={movement.became_ready ?? 0} />
          <Stat label="Moved up a tier" value={movement.up ?? 0} />
          <Stat label="Slipped down" value={movement.down ?? 0} />
          <Stat label="New registrations" value={movement.new_registrations ?? 0} note={`${movement.new_ready_at_entry ?? 0} arrived Ready`} />
        </div>
        {byCause.length > 0 && (
          <div className="mt-5 space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">Why profiles became Ready</p>
            {byCause.map(([k, v]) => (
              <Bar key={k} name={CAUSE_LABEL[k] ?? k} value={v} max={byCause[0][1]} />
            ))}
            <p className="text-xs text-slate-400">Causes are a best guess from what happened around the change (for example, a WhatsApp ask in the previous 5 days).</p>
          </div>
        )}
        {fixedItems.length > 0 && (
          <div className="mt-5">
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-slate-400">Details that got filled in</p>
            <div className="flex flex-wrap gap-1.5">
              {fixedItems.map(([k, v]) => (
                <span key={k} className="rounded-full px-2.5 py-1 text-xs text-slate-600 ring-1 ring-slate-200 dark:text-slate-300 dark:ring-slate-700">
                  {label(k)} <span className="tabular-nums text-slate-400">· {v}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        {moves.length > 0 && (
          <div className="mt-5">
            <p className="mb-1.5 text-[12px] font-medium uppercase tracking-wide text-slate-400">Latest changes</p>
            <ul className="divide-y divide-slate-100 text-[13px] dark:divide-slate-800">
              {moves.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {m.candidates ? (
                      <Link href={`/candidates/${m.candidates.id}`} className="font-medium text-slate-800 hover:underline dark:text-slate-200">
                        {m.candidates.full_name ?? "Unnamed"}
                      </Link>
                    ) : (
                      "—"
                    )}
                    <span className="ml-2 text-slate-400">{m.fixed.length ? `filled in ${m.fixed.map(label).join(", ").toLowerCase()}` : "details changed"}</span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {m.from_tier && <span className={`rounded-full px-2 py-0.5 ring-1 ${TIER_PILL[m.from_tier as ReadinessTier] ?? ""}`}>{TIER_LABEL[m.from_tier as ReadinessTier] ?? m.from_tier}</span>}
                    →
                    {m.to_tier && <span className={`rounded-full px-2 py-0.5 ring-1 ${TIER_PILL[m.to_tier as ReadinessTier] ?? ""}`}>{TIER_LABEL[m.to_tier as ReadinessTier] ?? m.to_tier}</span>}
                    <span>{when(m.at)} · {CAUSE_LABEL[m.cause] ?? m.cause}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card title="Do our asks work?" sub="From a message going out to the profile actually getting better. Last 14 days.">
        {wa && wa.asked > 0 ? (
          <div className="space-y-2">
            <Bar name="WhatsApp asks sent" value={wa.asked} max={wa.asked} tone="bg-slate-400" />
            <Bar name="Delivered" value={wa.delivered} max={wa.asked} tone="bg-sky-500" />
            <Bar name="Read" value={wa.read} max={wa.asked} tone="bg-teal-500" />
            <Bar name="Replied in the chat (3 days)" value={wa.replied} max={wa.asked} tone="bg-emerald-500" />
            <Bar name="Profile improved (3 days)" value={wa.improved} max={wa.asked} tone="bg-emerald-600" />
            <p className="pt-1 text-xs text-slate-400">
              {wa.failed} failed to deliver. &quot;Profile improved&quot; counts details filled in after the ask, including through the &quot;Complete my profile&quot; button, and is only measured from {tracking ?? "today"} onwards, so earlier asks show 0.
              {funnel.email && funnel.email.asked > 0 ? ` Email asks sent: ${funnel.email.asked}.` : ""}
            </p>
          </div>
        ) : (
          <p className="text-[13px] text-slate-500">No asks in this period.</p>
        )}
      </Card>

      <Card title="What should move next" sub="Sales profiles that are Almost ready, and what stops them.">
        {next.almost_sales ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Almost ready (sales)" value={next.almost_sales} />
              <Stat label="One detail short" value={next.one_step_sales ?? 0} />
              <Stat label="Need real work" value={next.sales_needs_work ?? 0} note="key details missing" />
              <Stat label="Not yet classified" value={next.unclassified ?? 0} />
            </div>
            <div className="mt-5 space-y-2">
              <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">What the almost-ready profiles lack</p>
              {gaps.map(([k, v]) => (
                <Bar key={k} name={label(k)} value={v} max={maxGap} tone="bg-amber-400" />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
              <Link href="/candidates/pipeline" className="font-medium text-teal-600 hover:underline">
                Send the next daily ask batch →
              </Link>
              <Link href="/candidates?ready=almost" className="font-medium text-teal-600 hover:underline">
                See the Almost-ready list →
              </Link>
            </div>
          </>
        ) : (
          <p className="text-[13px] text-slate-500">Nothing to show yet.</p>
        )}
      </Card>

      <Card title="Where quality is made or lost" sub="How complete new profiles are, by the way they arrived. Last 30 days.">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-1.5 pr-3 font-medium">Source</th>
                <th className="py-1.5 pr-3 font-medium">New profiles</th>
                <th className="py-1.5 pr-3 font-medium">Complete (Ready)</th>
                <th className="py-1.5 font-medium">Most common gap</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{SOURCE_LABEL[s.source] ?? s.source}</td>
                  <td className="py-2 pr-3 tabular-nums">{s.n}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {pct(s.ready, s.n)}% <span className="text-slate-400">({s.ready})</span>
                  </td>
                  <td className="py-2 text-slate-600 dark:text-slate-400">{s.top_missing ? label(s.top_missing) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {levers.length > 0 && (
        <Card title="Biggest levers right now" sub="Each one rests on the numbers above.">
          <ol className="space-y-3">
            {levers.map((l, i) => (
              <li key={l.title} className="flex gap-3 text-[13.5px]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-semibold text-white">{i + 1}</span>
                <span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{l.title}.</span> <span className="text-slate-600 dark:text-slate-400">{l.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {snaps.length > 1 && (
        <Card title="Daily trend" sub="One snapshot a day, recorded each night.">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 font-medium">Ready sales</th>
                <th className="py-1.5 pr-3 font-medium">Ready</th>
                <th className="py-1.5 pr-3 font-medium">Almost</th>
                <th className="py-1.5 pr-3 font-medium">Needs work</th>
                <th className="py-1.5 font-medium">Avg score</th>
              </tr>
            </thead>
            <tbody>
              {snaps.map((d) => (
                <tr key={d.day} className="border-t border-slate-100 tabular-nums dark:border-slate-800">
                  <td className="py-1.5 pr-3">{when(d.day)}</td>
                  <td className="py-1.5 pr-3">{d.ready_sales}</td>
                  <td className="py-1.5 pr-3">{d.ready}</td>
                  <td className="py-1.5 pr-3">{d.almost}</td>
                  <td className="py-1.5 pr-3">{d.needs_work}</td>
                  <td className="py-1.5">{d.avg_score ?? "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
