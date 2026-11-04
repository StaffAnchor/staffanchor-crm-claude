import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { inr } from "@/lib/pro-sessions/core";
import { STAGE_TEXT, isTestPerson, pctText, stageOf, type Stage } from "@/lib/pro-sessions/funnel";

type Attempt = { id: string; service: string; name: string; email: string; phone: string; amount: number; stage: Stage; at: string; source: string | null };
type Ev = { sid: string; flow: string; service: string | null; step: string; booking_id: string | null; created_at: string; note: string | null };

const PERIODS = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "all", label: "All time", days: 0 },
] as const;

const SERVICE_TITLE: Record<string, string> = { "mock-interview": "Interview Prep + Mock Interview", "job-search-strategy": "Job Strategy + Resume Rebuild", "resume-writing": "Resume Writing", "recruiter-call": "Apply + recruiter call (₹199)" };
const CLICK_TEXT: Record<string, string> = {
  "hero-button": "Home card: Explore StaffAnchor Edge button",
  "hero-slot-chip": "Home card: next open slot chip",
  "hero-row-mock-interview": "Home card: Interview Prep row",
  "hero-row-resume-writing": "Home card: Resume Writing row",
  "hero-row-job-search-strategy": "Home card: Strategy + Resume row",
  "hero-recruiter-call": "Home card: recruiter call row",
  "book-mock-interview": "Edge page: Book interview prep",
  "book-job-search-strategy": "Edge page: Book the combo",
  "resume-writing": "Edge page: See resume writing",
  "recruiter-call": "Edge page: recruiter call, Choose a role",
};
const STEPS: { key: string; label: string }[] = [
  { key: "view", label: "Opened the page" },
  { key: "slot", label: "Picked a time" },
  { key: "ready", label: "Filled in details" },
  { key: "pay_click", label: "Pressed pay" },
  { key: "pay_open", label: "Payment window opened" },
  { key: "paid", label: "Paid" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const th = "pb-1.5 text-right font-medium";

// Read once the page is rendering data, so the clock stays out of the render body.
function clock() {
  return Date.now();
}

// Where people drop off on the Edge booking and resume order pages. Tests by us (GS, Gagan, anything marked test) are left out.
export default async function FunnelCard({ db, period }: { db: SupabaseClient; period: string | undefined }) {
  const p = PERIODS.find((x) => x.key === period) ?? PERIODS[1];
  const nowMs = clock();
  const since = p.days > 0 ? new Date(nowMs - p.days * 86_400_000).toISOString() : "2000-01-01T00:00:00Z";

  const [{ data: bk }, { data: ro }, { data: evs }, { data: vis }, { data: allBk }, { data: pc }] = await Promise.all([
    db.from("pro_bookings").select("id, service_slug, name, email, phone, status, amount_inr, razorpay_order_id, razorpay_payment_id, paid_at, created_at, source").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("resume_orders").select("id, name, email, phone, status, amount_inr, razorpay_order_id, paid_at, created_at, source, booking_id").is("booking_id", null).gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("edge_funnel_events").select("sid, flow, service, step, booking_id, created_at, note").gte("created_at", since).order("created_at").limit(20000),
    db.from("traffic_events").select("visitor_id").eq("kind", "visit").like("landing_path", "/edge%").not("landing_path", "like", "/edge/cv%").gte("created_at", since).limit(20000),
    db.from("pro_bookings").select("id, name, email, source"),
    db.from("paid_call_orders").select("id, candidate_id, amount_paise, status, razorpay_order_id, paid_at, refunded_at, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
  ]);
  // Home page visits (the page itself, not the job pages), to compare with clicks on the Edge card.
  const { count: homeVisits } = await db.from("traffic_events").select("id", { count: "exact", head: true }).eq("kind", "visit").eq("landing_path", "/").gte("created_at", since);
  const callPeople = new Map<string, { full_name: string | null; email: string | null; phone: string | null }>();
  const callCandIds = [...new Set((pc ?? []).map((c) => c.candidate_id as string).filter(Boolean))];
  if (callCandIds.length) {
    const { data: cands } = await db.from("candidates").select("id, full_name, email, phone").in("id", callCandIds);
    for (const c of cands ?? []) callPeople.set(c.id as string, c);
  }

  // Attempts: every held time or resume order, minus tests.
  const attempts: Attempt[] = [];
  const testBookings = new Set<string>();
  for (const b of allBk ?? []) if (isTestPerson(b.name, b.email, b.source)) testBookings.add(b.id as string);
  for (const b of bk ?? []) {
    if (isTestPerson(b.name, b.email, b.source)) continue;
    const stage = stageOf({ paid: b.status === "paid" || !!b.razorpay_payment_id, hasOrder: !!b.razorpay_order_id, createdAt: b.created_at, failed: b.status === "failed" }, nowMs);
    attempts.push({ id: b.id, service: b.service_slug, name: b.name, email: b.email, phone: b.phone, amount: b.amount_inr, stage, at: b.created_at, source: b.source });
  }
  for (const o of ro ?? []) {
    if (isTestPerson(o.name, o.email, o.source)) continue;
    const stage = stageOf({ paid: !!o.paid_at, hasOrder: !!o.razorpay_order_id, createdAt: o.created_at, failed: o.status === "failed" }, nowMs);
    attempts.push({ id: o.id, service: "resume-writing", name: o.name, email: o.email, phone: o.phone, amount: o.amount_inr, stage, at: o.created_at, source: o.source });
  }

  for (const c of pc ?? []) {
    const who = callPeople.get(c.candidate_id as string);
    if (isTestPerson(who?.full_name, who?.email, null)) continue;
    const paid = !!c.paid_at && !c.refunded_at;
    const stage = stageOf({ paid, hasOrder: !!c.razorpay_order_id, createdAt: c.created_at, failed: c.status === "failed" }, nowMs);
    attempts.push({ id: c.id, service: "recruiter-call", name: who?.full_name ?? "Candidate", email: who?.email ?? "", phone: who?.phone ?? "", amount: Math.round(Number(c.amount_paise ?? 0) / 100), stage, at: c.created_at, source: "job_page" });
  }

  const services = ["mock-interview", "job-search-strategy", "resume-writing", "recruiter-call"];
  const rows = [...services, "all"].map((s) => {
    const a = s === "all" ? attempts : attempts.filter((x) => x.service === s);
    const paid = a.filter((x) => x.stage === "paid").length;
    const reached = a.filter((x) => x.stage === "paid" || x.stage === "dropped_payment" || x.stage === "in_progress").length;
    const dropped = a.filter((x) => x.stage === "dropped_payment" || x.stage === "failed_start").length;
    return { s, tried: a.length, reached, paid, dropped, people: new Set(a.map((x) => x.email.toLowerCase())).size };
  });
  const all = rows[rows.length - 1];
  const revenue = attempts.filter((x) => x.stage === "paid").reduce((a, x) => a + x.amount, 0);
  const bySource = new Map<string, { tried: number; paid: number; revenue: number }>();
  for (const x of attempts) {
    const k = x.source ?? "direct";
    const cur = bySource.get(k) ?? { tried: 0, paid: 0, revenue: 0 };
    cur.tried += 1;
    if (x.stage === "paid") {
      cur.paid += 1;
      cur.revenue += x.amount;
    }
    bySource.set(k, cur);
  }
  const dropList = attempts.filter((x) => x.stage === "dropped_payment" || x.stage === "failed_start");
  const visitors = new Set((vis ?? []).map((v) => v.visitor_id as string | null).filter(Boolean)).size;

  // Steps: distinct visits (sid) reaching each step. A visit tied to one of our test bookings is left out entirely.
  const events = (evs ?? []) as Ev[];
  const clicks = new Map<string, number>();
  for (const e of events) if (e.step === "click") clicks.set(e.service ?? "", (clicks.get(e.service ?? "") ?? 0) + 1);
  const edgeViews = new Set(events.filter((e) => e.step === "view" && e.service === "edge-page").map((e) => e.sid)).size;
  const homeClicks = [...clicks.entries()].filter(([k]) => k.startsWith("hero-"));
  const homeClickTotal = homeClicks.reduce((a, [, n]) => a + n, 0);
  const testSids = new Set(events.filter((e) => e.booking_id && testBookings.has(e.booking_id)).map((e) => e.sid));
  const real = events.filter((e) => !testSids.has(e.sid));
  const firstEvent = events[0]?.created_at ?? null;
  const stepRows = [...services].map((s) => {
    const ofService = real.filter((e) => (e.service ?? "") === s);
    const counts = STEPS.map((st) => new Set(ofService.filter((e) => e.step === st.key).map((e) => e.sid)).size);
    const errors = ofService.filter((e) => e.step === "error");
    return { s, counts, errors };
  });
  const hasSteps = stepRows.some((r) => r.counts[0] > 0);
  const errorNotes = new Map<string, number>();
  for (const r of stepRows) for (const e of r.errors) errorNotes.set(e.note ?? "unknown", (errorNotes.get(e.note ?? "unknown") ?? 0) + 1);

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12px] font-medium ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Booking drop-offs</h2>
          <p className="mt-0.5 text-[12.5px] text-slate-500">Who tried to book or order, and where they stopped. Your own tests (names like GS or Gagan, anything marked test, @staffanchor.com) are left out.</p>
        </div>
        <div className="flex gap-1.5">
          {PERIODS.map((x) => (
            <Link key={x.key} href={`?fp=${x.key}`} scroll={false} className={chip(x.key === p.key)}>{x.label}</Link>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { t: "Landed on Edge pages", v: visitors, s: "visitors, from site tracking" },
          { t: "Tried to book or order", v: all.tried, s: `${all.people} ${all.people === 1 ? "person" : "people"}, ${pctText(all.tried, visitors)} of visitors` },
          { t: "Paid", v: all.paid, s: `${pctText(all.paid, all.tried)} of those who tried` },
          { t: "Revenue", v: inr(revenue), s: "from paid attempts, incl. GST" },
          { t: "Dropped before paying", v: all.dropped, s: all.dropped ? "listed below" : "nobody so far" },
        ].map((x) => (
          <div key={x.t} className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{x.t}</p>
            <p className="mt-0.5 text-[24px] font-semibold leading-none tabular-nums text-slate-900 dark:text-slate-100">{x.v}</p>
            <p className="mt-1 text-[11.5px] text-slate-500">{x.s}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-[11.5px] font-medium text-slate-500">Jobs site home page into Edge (clicks tracked from 4 Nov 2026)</p>
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <b className="tabular-nums text-slate-900 dark:text-slate-100">{homeVisits ?? 0}</b> visits landed on the home page · <b className="tabular-nums text-slate-900 dark:text-slate-100">{homeClickTotal}</b> clicks on the Edge card ({pctText(homeClickTotal, homeVisits ?? 0)}) · <b className="tabular-nums text-slate-900 dark:text-slate-100">{edgeViews}</b> opened the Edge page
          </p>
          {clicks.size > 0 && (
            <ul className="mt-2 space-y-1 text-[12.5px]">
              {[...clicks.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <li key={k} className="flex justify-between gap-3 text-slate-600 dark:text-slate-300"><span>{CLICK_TEXT[k] ?? k}</span><b className="tabular-nums text-slate-900 dark:text-slate-100">{n}</b></li>
              ))}
            </ul>
          )}
        </div>
        <div className="overflow-x-auto">
          <p className="mb-1 text-[11.5px] font-medium text-slate-500">Where paying leads come from</p>
          {bySource.size === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500 dark:bg-slate-800/60">No attempts in this period.</p>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="pb-1.5 text-left font-medium">Source</th>
                  <th className={th}>Tried</th>
                  <th className={th}>Paid</th>
                  <th className={th}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {[...bySource.entries()].sort((a, b) => b[1].revenue - a[1].revenue || b[1].tried - a[1].tried).map(([k, v]) => (
                  <tr key={k} className="border-b border-slate-50 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{k}</td>
                    <td className="py-1.5 text-right tabular-nums">{v.tried}</td>
                    <td className="py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{v.paid}</td>
                    <td className="py-1.5 text-right tabular-nums">{inr(v.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mt-5 overflow-x-auto">
        <p className="mb-1 text-[11.5px] font-medium text-slate-500">From the moment they pressed pay (complete history)</p>
        <table className="w-full min-w-[520px] text-[12.5px]">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
              <th className="pb-1.5 text-left font-medium">Service</th>
              <th className={th}>Tried</th>
              <th className={th}>Reached payment</th>
              <th className={th}>Paid</th>
              <th className={th}>Dropped</th>
              <th className={th}>Paid of tried</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s} className={`border-b border-slate-50 dark:border-slate-800/60 ${r.s === "all" ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{r.s === "all" ? "All services" : SERVICE_TITLE[r.s]}</td>
                <td className="py-1.5 text-right tabular-nums">{r.tried}</td>
                <td className="py-1.5 text-right tabular-nums">{r.reached}</td>
                <td className="py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{r.paid}</td>
                <td className={`py-1.5 text-right tabular-nums ${r.dropped ? "text-rose-700 dark:text-rose-400" : ""}`}>{r.dropped}</td>
                <td className="py-1.5 text-right tabular-nums">{pctText(r.paid, r.tried)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 overflow-x-auto">
        <p className="mb-1 text-[11.5px] font-medium text-slate-500">Step by step{firstEvent ? `, tracked since ${when(firstEvent)}` : ""} (separate visits, so one person can count more than once)</p>
        {!hasSteps ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500 dark:bg-slate-800/60">Tracking of the steps before payment is switched on and fills in as people use the booking pages. Nothing has been recorded in this period yet.</p>
        ) : (
          <table className="w-full min-w-[640px] text-[12.5px]">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="pb-1.5 text-left font-medium">Service</th>
                {STEPS.map((st) => <th key={st.key} className={th}>{st.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {stepRows.filter((r) => r.counts[0] > 0 || r.counts.some((c) => c > 0)).map((r) => (
                <tr key={r.s} className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{SERVICE_TITLE[r.s]}</td>
                  {r.counts.map((c, i) => (
                    <td key={STEPS[i].key} className="py-1.5 text-right tabular-nums">
                      {c}
                      {i > 0 && r.counts[i - 1] > 0 && <span className={`ml-1 text-[11px] ${c < r.counts[i - 1] ? "text-rose-600 dark:text-rose-400" : "text-slate-400"}`}>{pctText(c, r.counts[i - 1])}</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {errorNotes.size > 0 && (
          <p className="mt-2 text-[12px] text-amber-700 dark:text-amber-300">Errors people hit: {[...errorNotes.entries()].map(([k, v]) => `${k} (${v})`).join(", ")}</p>
        )}
        <p className="mt-2 text-[11.5px] text-slate-400">Testing it yourself? Open <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">jobs.staffanchor.com/edge?me=1</code> once on that browser and its visits are never recorded.</p>
      </div>

      <div className="mt-5">
        <p className="mb-1 text-[11.5px] font-medium text-slate-500">People who dropped before paying</p>
        {dropList.length === 0 ? (
          <p className="rounded-lg bg-slate-50 px-3 py-2.5 text-[12.5px] text-slate-500 dark:bg-slate-800/60">No real person has dropped between pressing pay and paying in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="pb-1.5 font-medium">When</th>
                  <th className="pb-1.5 font-medium">Person</th>
                  <th className="pb-1.5 font-medium">Service</th>
                  <th className="pb-1.5 font-medium">Where they stopped</th>
                  <th className="pb-1.5 text-right font-medium">Amount</th>
                  <th className="pb-1.5 font-medium">From</th>
                </tr>
              </thead>
              <tbody>
                {dropList.map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 align-top dark:border-slate-800/60">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-slate-500">{when(d.at)}</td>
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">
                      <span className="font-medium">{d.name}</span>
                      <span className="block text-[11.5px] text-slate-500"><a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a> · <a href={`mailto:${d.email}`} className="hover:underline">{d.email}</a></span>
                    </td>
                    <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{SERVICE_TITLE[d.service] ?? d.service}</td>
                    <td className="py-1.5 pr-2 text-rose-700 dark:text-rose-400">{STAGE_TEXT[d.stage]}</td>
                    <td className="py-1.5 text-right tabular-nums">{inr(d.amount)}</td>
                    <td className="py-1.5 pl-3 text-slate-500">{d.source ?? "direct"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
