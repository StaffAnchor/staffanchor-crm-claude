import Link from "next/link";
import { adminDb, inr } from "@/lib/pro-sessions/core";
import { isTestPerson } from "@/lib/pro-sessions/funnel";
import { analyse, findings, pctOf, type Touch } from "@/lib/website-funnel";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "14", label: "Last 14 days", days: 14 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "all", label: "Since tracking began", days: 0 },
] as const;
// The apply-form events (gate shown, submitted) have only been recorded since this day.
const APPLY_EVENTS_SINCE = "2026-10-31T00:00:00+05:30";

const card = "rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900";
const th = "pb-1.5 text-right font-medium";
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const TONE: Record<string, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  watch: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200",
  act: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
};
const TONE_LABEL: Record<string, string> = { good: "Working", watch: "Worth knowing", act: "Act on this" };

// Read once the page is rendering data, so the clock stays out of the render body.
function clock() {
  return Date.now();
}

export default async function WebsiteFunnelPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  const sp = await searchParams;
  const range = RANGES.find((x) => x.key === sp.r) ?? RANGES[1];
  const db = adminDb();
  if (!db) return <div className="mx-auto max-w-[1100px] px-5 py-8 text-[13px] text-slate-500">The database key is not set, so this view cannot load.</div>;
  const since = range.days > 0 ? new Date(clock() - range.days * 86_400_000).toISOString() : "2000-01-01T00:00:00Z";

  const { data: touchRows } = await db.from("traffic_events").select("visitor_id, kind, source, medium, landing_path, candidate_id, mandate_id, created_at").gte("created_at", since).order("created_at").limit(20000);
  const rows = (touchRows ?? []) as Touch[];
  const a = analyse(rows);

  // Website candidates created in the period: who they are, and who is on WhatsApp.
  const { data: candRows } = await db.from("candidates").select("id, full_name, email, phone, created_at, acquisition_source, whatsapp_opt_in, whatsapp_opt_in_source").not("acquisition_source", "is", null).gte("created_at", since).order("created_at", { ascending: false }).limit(2000);
  const cands = ((candRows ?? []) as { id: string; full_name: string | null; email: string | null; phone: string | null; created_at: string; acquisition_source: string | null; whatsapp_opt_in: boolean | null; whatsapp_opt_in_source: string | null }[]).filter((c) => !isTestPerson(c.full_name, c.email, null));
  const ids = cands.map((c) => c.id);
  const waIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("whatsapp_contacts").select("candidate_id").in("candidate_id", ids.slice(i, i + 200));
    for (const w of data ?? []) if (w.candidate_id) waIds.add(w.candidate_id as string);
  }
  const appliedIds = new Set(rows.filter((r) => r.kind === "apply" && r.candidate_id).map((r) => r.candidate_id as string));
  const visitsBefore = new Map<string, number>();
  const byVisitor = new Map<string, Touch[]>();
  for (const r of rows) if (r.visitor_id) byVisitor.set(r.visitor_id, [...(byVisitor.get(r.visitor_id) ?? []), r]);
  for (const t of byVisitor.values()) {
    const reg = t.find((x) => x.kind === "register" && x.candidate_id);
    if (reg?.candidate_id) visitsBefore.set(reg.candidate_id, t.filter((x) => x.kind === "visit" && x.created_at <= reg.created_at).length);
  }

  const [{ count: paidCalls }, { data: bk }, { data: ro }] = await Promise.all([
    db.from("paid_call_orders").select("id", { count: "exact", head: true }).not("paid_at", "is", null).is("refunded_at", null).gte("created_at", since),
    db.from("pro_bookings").select("name, email, source, amount_inr, status").eq("status", "paid").gte("created_at", since),
    db.from("resume_orders").select("name, email, source, amount_inr, paid_at").is("booking_id", null).not("paid_at", "is", null).gte("created_at", since),
  ]);
  const edgeSales = [...(bk ?? []), ...(ro ?? [])].filter((x) => !isTestPerson(x.name, x.email, x.source));
  const edgePaid = edgeSales.length;
  const revenue = edgeSales.reduce((s, x) => s + Number(x.amount_inr ?? 0), 0) + (paidCalls ?? 0) * 199;

  // The apply form's own events, over the days they have been recorded.
  const evSince = since > APPLY_EVENTS_SINCE ? since : APPLY_EVENTS_SINCE;
  const { data: evRows } = await db.from("quick_apply_clicks").select("event_type").gte("created_at", evSince).limit(20000);
  const ev = new Map<string, number>();
  for (const e of evRows ?? []) ev.set(e.event_type as string, (ev.get(e.event_type as string) ?? 0) + 1);

  const onWhatsApp = cands.filter((c) => waIds.has(c.id)).length;
  const optedIn = cands.filter((c) => c.whatsapp_opt_in).length;
  const optedInChatted = cands.filter((c) => c.whatsapp_opt_in && waIds.has(c.id)).length;
  const activated = cands.filter((c) => c.whatsapp_opt_in_source === "activation_message").length;
  const fs = findings(a, { onWhatsApp, signupCandidates: cands.length, optedIn, optedInChatted, paidCalls: paidCalls ?? 0, edgePaid });
  const profileVisitors = a.visitors.filter((v) => v.profile).length;
  const steps = [
    { label: "Visitors", n: a.visitors.length, note: `${a.sessions} sessions` },
    { label: "Created a profile", n: profileVisitors, note: "signed up or applied" },
    { label: "Applied to a role", n: a.visitors.filter((v) => v.applied).length, note: "at least one application" },
    { label: "Messaged us on WhatsApp", n: onWhatsApp, note: `of ${cands.length} website candidates; ${optedIn} opted in${activated ? `, ${activated} by sending the activation message` : ""}` },
    { label: "Paid for something", n: (paidCalls ?? 0) + edgePaid, note: "recruiter call, Edge or resume" },
  ];
  const maxStep = Math.max(1, steps[0].n);

  // Registered, did not apply, not on WhatsApp: the people to reach first.
  const callFirst = cands.filter((c) => !appliedIds.has(c.id) && !waIds.has(c.id) && c.phone).slice(0, 25);
  const maxDaily = Math.max(1, ...a.daily.map((d) => d.visits));

  const chip = (on: boolean) => `rounded-full border px-3 py-1 text-[12px] font-medium ${on ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"}`;

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="ros-page-title">Website funnel</h1>
          <p className="mt-1 max-w-3xl text-[13px] text-slate-500">Where jobs.staffanchor.com visitors come from, who signs up and applies, who comes back, who is on WhatsApp, and what they buy. Left out: our own testing ({a.internalExcluded} heavy-use browser{a.internalExcluded === 1 ? "" : "s"}, plus anything marked test), {a.employerVisitors} employer visit{a.employerVisitors === 1 ? "" : "s"} to the client portal, and {a.existingCandidates} existing candidate{a.existingCandidates === 1 ? "" : "s"} going back to their own account.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map((x) => (
            <Link key={x.key} href={`?r=${x.key}`} scroll={false} className={chip(x.key === range.key)}>{x.label}</Link>
          ))}
        </div>
      </div>

      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">What the data says</h2>
        {fs.length === 0 ? (
          <p className="mt-3 text-[13px] text-slate-500">Not enough visits in this period to say anything yet.</p>
        ) : (
          <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
            {fs.map((f) => (
              <li key={f.title} className={`rounded-xl border p-3.5 ${TONE[f.tone]}`}>
                <p className="text-[10.5px] font-semibold uppercase tracking-wide opacity-70">{TONE_LABEL[f.tone]}</p>
                <p className="mt-0.5 text-[13.5px] font-semibold">{f.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed opacity-90">{f.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">From visit to paying candidate</h2>
        <div className="mt-4 space-y-2.5">
          {steps.map((s, i) => (
            <div key={s.label}>
              <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                <span className="font-medium text-slate-800 dark:text-slate-200">{s.label} <span className="font-normal text-slate-400">· {s.note}</span></span>
                <span className="tabular-nums text-slate-700 dark:text-slate-300"><b>{s.n}</b>{i > 0 && i < 3 && steps[i - 1].n > 0 && <span className="ml-1.5 text-slate-400">{pctOf(s.n, steps[i - 1].n)}% of the step before</span>}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(1.5, (s.n / maxStep) * 100)}%` }} /></div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-slate-400">Revenue from website candidates in this period: {inr(revenue)}. WhatsApp and paid purchases are counted against website candidates, not against visitors.</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">New and returning visitors</h2>
          <table className="mt-3 w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-1.5 text-left font-medium">Visitors</th><th className={th}>People</th><th className={th}>Signed up</th><th className={th}>Rate</th></tr></thead>
            <tbody>
              <tr className="border-b border-slate-50 dark:border-slate-800/60"><td className="py-1.5">First visit only</td><td className="py-1.5 text-right tabular-nums">{a.firstTime.n}</td><td className="py-1.5 text-right tabular-nums">{a.firstTime.signup}</td><td className="py-1.5 text-right tabular-nums">{a.firstTime.rate}%</td></tr>
              <tr className="border-b border-slate-50 dark:border-slate-800/60"><td className="py-1.5">Came back (2 or more visits)</td><td className="py-1.5 text-right tabular-nums">{a.returning.n}</td><td className="py-1.5 text-right tabular-nums">{a.returning.signup}</td><td className="py-1.5 text-right font-semibold tabular-nums text-teal-700 dark:text-teal-400">{a.returning.rate}%</td></tr>
              <tr><td className="py-1.5">Visited 3+ times, not signed up</td><td className="py-1.5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">{a.heavyNoSignup}</td><td className="py-1.5" /><td className="py-1.5" /></tr>
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-slate-400">A visit is one browser session. Visitors are recognised by a cookie, so someone who clears it or switches phone counts as new.</p>
        </section>

        <section className={card}>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Applying on a job page <span className="text-[12px] font-normal text-slate-400">· recorded since 31 Oct</span></h2>
          <table className="mt-3 w-full text-[12.5px]">
            <tbody>
              {[["Tapped Apply free", "click"], ["Application form opened", "form_opened"], ["Email gate shown to a new visitor", "gate_shown"], ["Application submitted", "submitted"], ["Tapped the recruiter call button", "paid_call_click"]].map(([l, k]) => (
                <tr key={k} className="border-b border-slate-50 dark:border-slate-800/60"><td className="py-1.5">{l}</td><td className="py-1.5 text-right font-semibold tabular-nums">{ev.get(k) ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] text-slate-400">All counted over the same days, so the steps can be compared. Applications through the register page and the 30-second box are not in these lines, so they can be lower than the application total above.</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">By source</h2>
          <table className="mt-3 w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-1.5 text-left font-medium">Source</th><th className={th}>Visitors</th><th className={th}>Signed up</th><th className={th}>Applied</th><th className={th}>Rate</th></tr></thead>
            <tbody>
              {a.bySource.map((s) => (
                <tr key={s.name} className="border-b border-slate-50 dark:border-slate-800/60"><td className="py-1.5">{s.name}</td><td className="py-1.5 text-right tabular-nums">{s.visitors}</td><td className="py-1.5 text-right tabular-nums">{s.signups}</td><td className="py-1.5 text-right tabular-nums">{s.applies}</td><td className="py-1.5 text-right tabular-nums">{s.rate}%</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={card}>
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">By first page seen</h2>
          <table className="mt-3 w-full text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-1.5 text-left font-medium">Landed on</th><th className={th}>Visitors</th><th className={th}>Signed up</th><th className={th}>Rate</th></tr></thead>
            <tbody>
              {a.byLanding.map((l) => (
                <tr key={l.name} className="border-b border-slate-50 dark:border-slate-800/60"><td className="py-1.5">{l.name}</td><td className="py-1.5 text-right tabular-nums">{l.visitors}</td><td className="py-1.5 text-right tabular-nums">{l.signups}</td><td className="py-1.5 text-right tabular-nums">{l.rate}%</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Reach these first</h2>
        <p className="mt-0.5 text-[12.5px] text-slate-500">Registered on the website, never applied to a role, not on WhatsApp. They have a phone number and showed no offer on the Build your profile route until the latest release: a profile review or a WhatsApp message is the natural first touch.</p>
        {callFirst.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-slate-400">No one in this period fits.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead><tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-1.5 font-medium">Candidate</th><th className="pb-1.5 font-medium">Phone</th><th className="pb-1.5 font-medium">Came from</th><th className="pb-1.5 text-right font-medium">Visits before signup</th><th className="pb-1.5 text-right font-medium">Signed up</th></tr></thead>
              <tbody>
                {callFirst.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 dark:border-slate-800/60">
                    <td className="py-1.5 pr-2"><Link href={`/candidates/${c.id}`} className="font-medium text-teal-700 hover:underline dark:text-teal-400">{c.full_name || "Unnamed"}</Link></td>
                    <td className="py-1.5 pr-2"><a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a></td>
                    <td className="py-1.5 pr-2 text-slate-500">{c.acquisition_source}</td>
                    <td className="py-1.5 text-right tabular-nums">{visitsBefore.get(c.id) ?? "–"}</td>
                    <td className="py-1.5 text-right text-slate-500">{when(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Day by day</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[460px] text-[12.5px]">
            <thead><tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400 dark:border-slate-800"><th className="pb-1.5 text-left font-medium">Day</th><th className={th}>Visits</th><th className={th}>Signups</th><th className={th}>Applications</th></tr></thead>
            <tbody>
              {a.daily.slice(0, 31).map((d) => (
                <tr key={d.day} className="border-b border-slate-50 dark:border-slate-800/60">
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</td>
                  <td className="py-1.5 text-right"><span className="inline-flex items-center gap-2"><span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 sm:inline-block dark:bg-slate-800"><span className="block h-full rounded-full bg-slate-400" style={{ width: `${(d.visits / maxDaily) * 100}%` }} /></span><span className="tabular-nums">{d.visits}</span></span></td>
                  <td className="py-1.5 text-right tabular-nums font-medium text-teal-700 dark:text-teal-400">{d.signups}</td>
                  <td className="py-1.5 text-right tabular-nums">{d.applies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
