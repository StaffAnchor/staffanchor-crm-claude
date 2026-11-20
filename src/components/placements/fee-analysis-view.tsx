import type { FeeAnalysis, Bucket, FeeClass, Slice } from "@/lib/placements/fee-analysis";
import { shortDate } from "@/lib/anchor/data";
import FeeRowActions from "./fee-row-actions";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");
const card = "rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

const CLS: Record<FeeClass, { label: string; chip: string; bar: string }> = {
  received: { label: "Received", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", bar: "bg-emerald-500" },
  waiting: { label: "Invoiced, waiting", chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", bar: "bg-amber-400" },
  not_invoiced: { label: "Not invoiced yet", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-300" },
  dropped: { label: "Lost to a drop", chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", bar: "bg-rose-400" },
  refund_due: { label: "Refund due", chip: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200", bar: "bg-rose-600" },
  refunded: { label: "Refunded", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", bar: "bg-slate-400" },
  voided: { label: "Voided", chip: "bg-slate-100 text-slate-500", bar: "bg-slate-200" },
};

function Kpi({ label, value, sub, tone = "plain" }: { label: string; value: string; sub?: string; tone?: "plain" | "good" | "warn" | "bad" }) {
  const t = { plain: "text-slate-900 dark:text-slate-100", good: "text-emerald-700 dark:text-emerald-300", warn: "text-amber-700 dark:text-amber-300", bad: "text-rose-700 dark:text-rose-300" }[tone];
  return (
    <div className={`${card} p-4`}>
      <p className="text-[13px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-1 text-[24px] font-semibold leading-tight tabular-nums ${t}`}>{value}</p>
      {sub ? <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{sub}</p> : null}
    </div>
  );
}

/** One horizontal bar split into received / waiting / not invoiced / lost, scaled to `max`. */
function Stack({ s, max }: { s: Slice; max: number }) {
  const parts = [
    { v: s.received, c: CLS.received.bar, t: `Received ${inr(s.received)}` },
    { v: s.waiting, c: CLS.waiting.bar, t: `Invoiced, waiting ${inr(s.waiting)}` },
    { v: s.notInvoiced, c: CLS.not_invoiced.bar, t: `Not invoiced ${inr(s.notInvoiced)}` },
    { v: s.dropped, c: CLS.dropped.bar, t: `Lost to drops ${inr(s.dropped)}` },
  ];
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={parts.map((p) => p.t).join(", ")}>
      {parts.map((p, i) => (p.v > 0 ? <span key={i} className={p.c} title={p.t} style={{ width: `${(p.v / Math.max(1, max)) * 100}%` }} /> : null))}
    </div>
  );
}

const Legend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
    {(["received", "waiting", "not_invoiced", "dropped"] as FeeClass[]).map((k) => (
      <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${CLS[k].bar}`} />{CLS[k].label}</span>
    ))}
  </div>
);

function Buckets({ title, blurb, rows, empty, valueLabel = "fees" }: { title: string; blurb: string; rows: Bucket[]; empty: string; valueLabel?: string }) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(1, ...rows.map((r) => r.amount));
  const any = rows.some((r) => r.count > 0);
  return (
    <section className={`${card} p-4`}>
      <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="text-[13px] text-slate-500">{blurb}</p>
      {!any ? (
        <p className="mt-3 text-[14px] text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="text-slate-700 dark:text-slate-200">{r.label}</span>
                <span className="tabular-nums text-slate-500">{r.count} {valueLabel}{r.amount ? ` · ${inr(r.amount)}` : ""}{total && r.amount ? ` · ${pct(r.amount, total)}` : ""}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-teal-500" style={{ width: `${(r.amount / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const monthLabel = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" }) : m);

// Fee status and drop analysis for the whole book: what was booked, what was lost, what is coming and what has come in.
export default function FeeAnalysisView({ a }: { a: FeeAnalysis }) {
  const maxClient = Math.max(1, ...a.clients.map((c) => c.gross));
  const maxMonth = Math.max(1, ...a.months.map((m) => m.gross));
  const order: FeeClass[] = ["refund_due", "waiting", "not_invoiced", "received", "dropped", "refunded"];
  const ledger = a.lines.filter((x) => x.cls !== "voided").sort((x, y) => order.indexOf(x.cls) - order.indexOf(y.cls) || y.daysOverdue - x.daysOverdue || y.amount - x.amount);
  const voided = a.lines.filter((x) => x.cls === "voided").length;
  const dropPct = pct(a.droppedPlacements, a.placements);

  return (
    <div className="space-y-5">
      <section className={`${card} p-4`}>
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">What stands out</h2>
        <ul className="mt-2 space-y-1.5 text-[14px] text-slate-700 dark:text-slate-200">
          {a.insights.map((t, i) => (<li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />{t}</li>))}
        </ul>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi label="Fees booked" value={inr(a.gross)} sub={`${a.lines.length - voided} fees on ${a.placements} placements`} />
        <Kpi label="Lost to drops" value={inr(a.dropped)} sub={`${pct(a.dropped, a.gross)} of booked`} tone={a.dropped > 0 ? "bad" : "plain"} />
        <Kpi label="Final expected fee" value={inr(a.net)} sub="Booked minus drops" tone="good" />
        <Kpi label="Received" value={inr(a.received)} sub={`${pct(a.received, a.gross)} of booked`} tone={a.received > 0 ? "good" : "warn"} />
        <Kpi label="Invoiced, waiting" value={inr(a.waiting)} sub={a.overdueCount ? `${inr(a.overdue)} past due across ${a.overdueCount}` : "None past due"} tone={a.overdueCount ? "warn" : "plain"} />
        <Kpi label="Not invoiced yet" value={inr(a.notInvoiced)} sub="Expected, no invoice sent" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Fee realisation" value={pct(a.received, a.gross)} sub="Received ÷ booked" />
        <Kpi label="Collection rate" value={pct(a.received, a.received + a.waiting)} sub="Received ÷ invoiced" />
        <Kpi label="Drop rate" value={dropPct} sub={`${a.droppedPlacements} of ${a.placements} placements`} tone={a.droppedPlacements > 0 ? "bad" : "plain"} />
        <Kpi label="Days to collect" value={a.avgDaysToCollect !== null ? `${a.avgDaysToCollect}` : "—"} sub={a.avgDaysToInvoice !== null ? `Invoice goes out ${a.avgDaysToInvoice} days after joining` : "Needs a paid invoice"} />
      </div>
      {a.refundDue > 0 && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] font-medium text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{inr(a.refundDue)} was paid and has to be refunded.</p>}

      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Where every booked rupee stands</h3><Legend /></div>
        <div className="mt-3"><Stack s={{ received: a.received, waiting: a.waiting, notInvoiced: a.notInvoiced, dropped: a.dropped }} max={a.gross} /></div>
        <p className="mt-2 text-[13px] text-slate-500">{inr(a.received)} received · {inr(a.waiting)} waiting · {inr(a.notInvoiced)} not invoiced · {inr(a.dropped)} lost</p>
      </section>

      <section className={`${card} overflow-hidden`}>
        <header className="px-4 pt-4"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">By client</h3><p className="text-[13px] text-slate-500">Who pays, who drops, and how much of what we booked turns into cash.</p></header>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[820px] text-[13px]">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr>
              <th className="px-4 py-2">Client</th><th className="px-2 py-2 text-right">Placed</th><th className="px-2 py-2 text-right">Dropped</th><th className="px-2 py-2 text-right">Drop %</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Realised</th><th className="px-4 py-2">Mix</th>
            </tr></thead>
            <tbody>
              {a.clients.map((c) => (
                <tr key={c.client} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{c.client}</td>
                  <td className="px-2 text-right tabular-nums">{c.placements}</td>
                  <td className="px-2 text-right tabular-nums">{c.dropped_n}</td>
                  <td className={`px-2 text-right tabular-nums ${c.dropped_n > 0 ? "font-medium text-rose-700" : ""}`}>{pct(c.dropped_n, c.placements)}</td>
                  <td className="px-2 text-right tabular-nums">{inr(c.gross)}</td>
                  <td className="px-2 text-right tabular-nums">{inr(c.received)}</td>
                  <td className="px-2 text-right tabular-nums">{pct(c.received, c.gross)}</td>
                  <td className="w-44 px-4"><Stack s={c} max={maxClient} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${card} overflow-hidden`}>
        <header className="px-4 pt-4"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">By joining month</h3><p className="text-[13px] text-slate-500">Each month&apos;s placements and what became of their fees.</p></header>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr>
              <th className="px-4 py-2">Month</th><th className="px-2 py-2 text-right">Placed</th><th className="px-2 py-2 text-right">Dropped</th><th className="px-2 py-2 text-right">Drop %</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Received</th><th className="px-4 py-2">Mix</th>
            </tr></thead>
            <tbody>
              {a.months.map((m) => (
                <tr key={m.month} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{monthLabel(m.month)}</td>
                  <td className="px-2 text-right tabular-nums">{m.placements}</td>
                  <td className="px-2 text-right tabular-nums">{m.dropped_n}</td>
                  <td className={`px-2 text-right tabular-nums ${m.dropped_n > 0 ? "font-medium text-rose-700" : ""}`}>{pct(m.dropped_n, m.placements)}</td>
                  <td className="px-2 text-right tabular-nums">{inr(m.gross)}</td>
                  <td className="px-2 text-right tabular-nums">{inr(m.received)}</td>
                  <td className="w-44 px-4"><Stack s={m} max={maxMonth} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Buckets title="How late unpaid fees are" blurb="Invoiced or not, past the due date." rows={a.aging} empty="Nothing is waiting to be paid." />
        <Buckets title="Cash still to come in" blurb="Unpaid fees by when they fall due." rows={a.forecast} empty="Nothing is waiting to be paid." />
        <Buckets title="When people leave" blurb="Days after joining. The guarantee is 90." rows={a.dropTiming} empty="Nobody has dropped." valueLabel="people" />
        <Buckets title="Why they leave" blurb="From the reason recorded with each drop." rows={a.reasons} empty="Nobody has dropped." valueLabel="people" />
      </div>

      <section className={`${card} overflow-hidden`}>
        <header className="px-4 pt-4"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Still inside the 90-day guarantee</h3><p className="text-[13px] text-slate-500">These fees are not safe until the day count reaches zero. Soonest first.</p></header>
        {a.atRisk.length === 0 ? <p className="px-4 py-4 text-[14px] text-slate-500">Nobody is inside the guarantee now.</p> : (
          <ul className="mt-2">
            {a.atRisk.map((r) => (
              <li key={r.linkId} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <div className="min-w-0"><a href={`/candidates/${r.candidateId}`} target="_blank" rel="noopener noreferrer" className="text-[14px] font-medium text-slate-900 hover:text-teal-700 dark:text-slate-100">{r.candidate}</a><p className="text-[12px] text-slate-500">{r.client} · {r.role} · joined {shortDate(r.joined)}</p></div>
                <div className="text-right text-[13px] tabular-nums"><p className="font-medium text-slate-900 dark:text-slate-100">{inr(r.atStake)} at stake</p><p className={r.daysLeft <= 14 ? "text-emerald-700" : "text-slate-500"}>{r.daysLeft} days left</p></div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="every-fee" className={`${card} scroll-mt-20 overflow-hidden`}>
        <header className="px-4 pt-4"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Every fee</h3><p className="text-[13px] text-slate-500">The detail behind the numbers. Anything needing action is first. Mark a fee received here once the money lands.</p></header>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[900px] text-[13px]">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr>
              <th className="px-4 py-2">Client and candidate</th><th className="px-2 py-2">Status</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2">Due</th><th className="px-2 py-2">Invoiced</th><th className="px-2 py-2">Paid</th><th className="px-4 py-2 text-right">Action</th>
            </tr></thead>
            <tbody>
              {ledger.map((x) => (
                <tr key={x.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2.5"><p className="font-medium text-slate-900 dark:text-slate-100">{x.client}</p><p className="text-[12px] text-slate-500">{x.candidate} · {x.role}</p></td>
                  <td className="px-2"><span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${CLS[x.cls].chip}`}>{CLS[x.cls].label}</span></td>
                  <td className="px-2 text-right tabular-nums">{inr(x.amount)}{x.estimated ? <span className="block text-[11px] text-slate-400">estimate</span> : null}</td>
                  <td className={`px-2 ${x.daysOverdue > 0 ? "font-medium text-rose-700" : ""}`}>{x.dueOn ? shortDate(x.dueOn) : "—"}{x.daysOverdue > 0 ? <span className="block text-[11px]">{x.daysOverdue} days late</span> : null}</td>
                  <td className="px-2">{x.invoicedOn ? shortDate(x.invoicedOn) : "—"}</td>
                  <td className="px-2">{x.paidOn ? shortDate(x.paidOn) : "—"}</td>
                  <td className="px-4 text-right"><FeeRowActions feeId={x.id} cls={x.cls} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>


      <section className={`${card} p-4`}>
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Ties out to Analytics, Revenue</h3>
        <p className="text-[13px] text-slate-500">Analytics adds the invoices raised before this CRM to the fees since. The same sum, so the two pages agree.</p>
        <dl className="mt-3 grid gap-y-1.5 text-[14px] sm:grid-cols-[1fr_auto] sm:gap-x-8">
          <dt className="text-slate-600 dark:text-slate-300">Before the CRM: {a.historical.count} imported invoices{a.historical.oldest ? `, ${shortDate(a.historical.oldest)} to ${shortDate(a.historical.newest)}` : ""}</dt>
          <dd className="tabular-nums text-slate-900 dark:text-slate-100 sm:text-right">{inr(a.historical.net)}</dd>
          <dt className="text-slate-600 dark:text-slate-300">Fees since the CRM, after drops (the final expected fee above)</dt>
          <dd className="tabular-nums text-slate-900 dark:text-slate-100 sm:text-right">{inr(a.net)}</dd>
          <dt className="border-t border-slate-100 pt-1.5 font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Total, before GST</dt>
          <dd className="border-t border-slate-100 pt-1.5 font-semibold tabular-nums text-slate-900 dark:border-slate-800 dark:text-slate-100 sm:text-right">{inr(a.historical.net + a.net)}</dd>
          <dt className="text-slate-500">With 18% GST on the fees since the CRM, plus the imported invoices as billed</dt>
          <dd className="tabular-nums text-slate-500 sm:text-right">{inr(a.historical.gross + a.net * 1.18)}</dd>
        </dl>
        <p className="mt-2 text-[12px] text-slate-400">The imported invoices carry no payment status, so they are history, not part of received or waiting above.</p>
        {a.historical.byClient.length > 0 && (
          <details className="mt-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/40">
            <summary className="cursor-pointer text-[13px] text-slate-600 dark:text-slate-300">Imported invoices by client ({a.historical.byClient.length})</summary>
            <ul className="mt-2 space-y-1 text-[13px]">
              {a.historical.byClient.map((c) => (<li key={c.client} className="flex justify-between gap-3"><span className="truncate text-slate-700 dark:text-slate-200">{c.client}</span><span className="shrink-0 tabular-nums text-slate-500">{c.count} · {inr(c.net)}</span></li>))}
            </ul>
          </details>
        )}
      </section>

      <p className="text-[12px] text-slate-400">
        Amounts are before 18% GST (add GST to compare with invoices: expected {inr(a.net * 1.18)} incl. GST). A fee that was replaced or corrected while the person stayed placed is voided and left out of every number{voided ? ` (${voided} such fee${voided === 1 ? "" : "s"})` : ""}. Figures as of {shortDate(a.asOf)}.
      </p>
    </div>
  );
}
