import { stageOf, type Bucket, type FeeAnalysis, type FeeLine, type Slice, type Stage } from "@/lib/placements/fee-analysis";
import { BILL_BY_DAYS, BILL_FROM_DAYS, PAYABLE_DAYS, PAY_OUTER_DAYS, PAY_TARGET_DAYS } from "@/lib/placements/fee-timing";
import { GUARANTEE_DAYS } from "@/lib/placements/drops";
import { shortDate } from "@/lib/anchor/data";
import FeeRowActions from "./fee-row-actions";

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");
const card = "rounded-ros-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900";

const STAGES: { key: Stage; label: string; when: string; bar: string; chip: string; tone: string }[] = [
  { key: "potential", label: "Potential", when: `The candidate has joined. Billed ${BILL_FROM_DAYS} to ${BILL_BY_DAYS} days after joining.`, bar: "bg-slate-300", chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200", tone: "border-slate-200 dark:border-slate-800" },
  { key: "billed", label: "Billed", when: `Invoice sent, payable ${PAYABLE_DAYS} days after billing: received about ${PAY_TARGET_DAYS} days after joining (up to ${PAY_OUTER_DAYS}).`, bar: "bg-amber-400", chip: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300", tone: "border-amber-200 dark:border-amber-900" },
  { key: "received", label: "Received", when: "Paid by the client and kept.", bar: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", tone: "border-emerald-200 dark:border-emerald-900" },
  { key: "cancelled", label: "Cancelled", when: `The candidate left inside ${GUARANTEE_DAYS} days, or the fee was cancelled.`, bar: "bg-rose-400", chip: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", tone: "border-rose-200 dark:border-rose-900" },
];
const ST = Object.fromEntries(STAGES.map((s) => [s.key, s])) as Record<Stage, (typeof STAGES)[number]>;

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

/** One horizontal bar split into the four stages, scaled to `max`. */
function Stack({ s, max }: { s: Slice; max: number }) {
  const parts = STAGES.map((st) => ({ v: s[st.key], c: st.bar, t: `${st.label} ${inr(s[st.key])}` }));
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={parts.map((p) => p.t).join(", ")}>
      {parts.map((p, i) => (p.v > 0 ? <span key={i} className={p.c} title={p.t} style={{ width: `${(p.v / Math.max(1, max)) * 100}%` }} /> : null))}
    </div>
  );
}

const Legend = () => (
  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-500">
    {STAGES.map((s) => (<span key={s.key} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${s.bar}`} />{s.label}</span>))}
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

function Ledger({ stage, lines }: { stage: Stage; lines: FeeLine[] }) {
  const s = ST[stage];
  const total = lines.reduce((a, x) => a + x.amount, 0);
  return (
    <section className={`${card} overflow-hidden`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h4 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100"><span className={`mr-2 rounded-full px-2.5 py-0.5 text-[13px] font-medium ${s.chip}`}>{s.label}</span><span className="text-slate-400">{lines.length}</span></h4>
        <p className="text-[13px] tabular-nums text-slate-500">{inr(total)}</p>
      </header>
      <p className="px-4 pb-1 text-[12px] text-slate-500">{s.when}</p>
      {lines.length === 0 ? (
        <p className="border-t border-slate-100 px-4 py-4 text-[14px] text-slate-500 dark:border-slate-800">None.</p>
      ) : (
        <ul>
          {lines.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="min-w-[200px] flex-1">
                <p className="text-[14px] font-medium text-slate-900 dark:text-slate-100">{x.client}</p>
                <p className="text-[12px] text-slate-500">{x.candidate} · {x.role}</p>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {x.joinedOn ? `Joined ${shortDate(x.joinedOn)}${x.daysSinceJoin !== null ? ` · day ${x.daysSinceJoin}` : ""}` : "No joining date"}
                  {x.invoicedOn ? ` · billed ${shortDate(x.invoicedOn)}` : ""}
                  {x.paidOn ? ` · received ${shortDate(x.paidOn)}` : ""}
                  {x.cls === "potential" && x.billByOn ? ` · bill by ${shortDate(x.billByOn)}` : ""}
                  {x.cls === "billed" && x.payByOn ? ` · payable by ${shortDate(x.payByOn)}` : ""}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] font-medium">
                  {x.late === "bill" && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{x.daysOverdue} days past the billing window (day {BILL_BY_DAYS})</span>}
                  {x.late === "collect" && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700">{x.daysOverdue} days past its payment date</span>}
                  {x.cls === "refund_due" && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800">Paid, now refund due</span>}
                  {x.cls === "refunded" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">Refunded</span>}
                  {stage === "cancelled" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-600">{x.cancelKind === "left" ? "Candidate left" : x.cancelReason ?? "Cancelled"}</span>}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-[15px] font-semibold tabular-nums text-slate-900 dark:text-slate-100">{inr(x.amount)}</p>
                <FeeRowActions feeId={x.id} cls={x.cls} linkId={x.linkId} candidate={x.candidate} client={x.client} joinedOn={x.joinedOn} cancelKind={x.cancelKind} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Fee stages and drop analysis for the whole book: potential, billed, received, cancelled, and what each client does.
export default function FeeAnalysisView({ a }: { a: FeeAnalysis }) {
  const maxClient = Math.max(1, ...a.clients.map((c) => c.gross));
  const maxMonth = Math.max(1, ...a.months.map((m) => m.gross));
  const live = a.lines.filter((x) => x.cls !== "voided");
  const byStage = (s: Stage) => live.filter((x) => stageOf(x.cls) === s).sort((x, y) => (y.daysSinceJoin ?? 0) - (x.daysSinceJoin ?? 0) || y.amount - x.amount);
  const voided = a.lines.filter((x) => x.cls === "voided").length;
  const summary = { potential: a.potential, billed: a.billed, received: a.received, cancelled: a.cancelled } as const;

  return (
    <div className="space-y-5">
      <section className={`${card} p-4`}>
        <h2 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">What stands out</h2>
        <ul className="mt-2 space-y-1.5 text-[14px] text-slate-700 dark:text-slate-200">
          {a.insights.map((t, i) => (<li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-500" />{t}</li>))}
        </ul>
      </section>

      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STAGES.map((s, i) => {
            const m = summary[s.key];
            return (
              <div key={s.key} className={`${card} relative border-l-4 p-4 ${s.tone}`}>
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-medium text-slate-500 dark:text-slate-400">{i + 1 <= 3 ? `${i + 1}. ` : ""}{s.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${s.chip}`}>{m.count}</span>
                </div>
                <p className="mt-1 text-[24px] font-semibold leading-tight tabular-nums text-slate-900 dark:text-slate-100">{inr(m.amount)}</p>
                <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{pct(m.amount, a.gross)} of booked</p>
                <p className="mt-2 text-[12px] leading-snug text-slate-500 dark:text-slate-400">{s.when}</p>
                {m.late > 0 && s.key !== "cancelled" && s.key !== "received" && (
                  <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[12px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{m.late} late: {inr(m.lateAmount)}</p>
                )}
                {s.key === "cancelled" && m.count > 0 && <p className="mt-2 text-[12px] text-slate-500">{inr(a.cancelled.left)} candidate left{a.cancelled.other ? `, ${inr(a.cancelled.other)} cancelled otherwise` : ""}</p>}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-slate-500">
          So far: billed {a.avgDaysJoinToBill !== null ? `${a.avgDaysJoinToBill} days` : "no data yet"} after joining on average (normal: {BILL_FROM_DAYS} to {BILL_BY_DAYS}), received {a.avgDaysJoinToCollect !== null ? `${a.avgDaysJoinToCollect} days` : "no data yet"} after joining (normal: about {PAY_TARGET_DAYS}, up to {PAY_OUTER_DAYS}).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Fees booked" value={inr(a.gross)} sub={`${live.length} fees on ${a.placements} placements`} />
        <Kpi label="Final expected fee" value={inr(a.net)} sub="Booked minus cancelled" tone="good" />
        <Kpi label="Fee realisation" value={pct(a.received.amount, a.gross)} sub="Received ÷ booked" />
        <Kpi label="Collection rate" value={pct(a.received.amount, a.received.amount + a.billed.amount)} sub="Received ÷ (received + billed)" />
        <Kpi label="Drop rate" value={pct(a.droppedPlacements, a.placements)} sub={`${a.droppedPlacements} of ${a.placements} placements`} tone={a.droppedPlacements > 0 ? "bad" : "plain"} />
      </div>
      {a.refundDue > 0 && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[14px] font-medium text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">{inr(a.refundDue)} was paid and has to be refunded.</p>}

      <section className={`${card} p-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Where every booked rupee stands</h3><Legend /></div>
        <div className="mt-3"><Stack s={{ received: a.received.amount, billed: a.billed.amount, potential: a.potential.amount, cancelled: a.cancelled.amount }} max={a.gross} /></div>
      </section>

      <div className="space-y-4">
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">Every fee, by stage</h3>
        <p className="-mt-3 text-[13px] text-slate-500">Change a fee&apos;s status here. It updates Billing, Analytics and the tracker too.</p>
        {STAGES.map((s) => <Ledger key={s.key} stage={s.key} lines={byStage(s.key)} />)}
      </div>

      <section className={`${card} overflow-hidden`}>
        <header className="px-4 pt-4"><h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">By client</h3><p className="text-[13px] text-slate-500">Who pays, who drops, and how much of what we booked turns into cash.</p></header>
        <div className="overflow-x-auto">
          <table className="mt-3 w-full min-w-[820px] text-[13px]">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-400"><tr>
              <th className="px-4 py-2">Client</th><th className="px-2 py-2 text-right">Placed</th><th className="px-2 py-2 text-right">Dropped</th><th className="px-2 py-2 text-right">Drop %</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Received</th><th className="px-2 py-2 text-right">Realised</th><th className="px-4 py-2">Stages</th>
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
              <th className="px-4 py-2">Month</th><th className="px-2 py-2 text-right">Placed</th><th className="px-2 py-2 text-right">Dropped</th><th className="px-2 py-2 text-right">Drop %</th><th className="px-2 py-2 text-right">Booked</th><th className="px-2 py-2 text-right">Received</th><th className="px-4 py-2">Stages</th>
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
        <Buckets title="How late unpaid fees are" blurb="Past the day it should have been billed, or past its payment date once billed." rows={a.aging} empty="Nothing is waiting to be paid." />
        <Buckets title="Cash still to come in" blurb="Unpaid fees by when the money should arrive: 15 days after billing, or about 60 days after joining if not billed yet." rows={a.forecast} empty="Nothing is waiting to be paid." />
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

      <section className={`${card} p-4`}>
        <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Ties out to Analytics, Revenue</h3>
        <p className="text-[13px] text-slate-500">Analytics adds the invoices raised before this CRM to the fees since. The same sum, so the two pages agree.</p>
        <dl className="mt-3 grid gap-y-1.5 text-[14px] sm:grid-cols-[1fr_auto] sm:gap-x-8">
          <dt className="text-slate-600 dark:text-slate-300">Before the CRM: {a.historical.count} imported invoices{a.historical.oldest ? `, ${shortDate(a.historical.oldest)} to ${shortDate(a.historical.newest)}` : ""}</dt>
          <dd className="tabular-nums text-slate-900 dark:text-slate-100 sm:text-right">{inr(a.historical.net)}</dd>
          <dt className="text-slate-600 dark:text-slate-300">Fees since the CRM, after cancellations (the final expected fee above)</dt>
          <dd className="tabular-nums text-slate-900 dark:text-slate-100 sm:text-right">{inr(a.net)}</dd>
          <dt className="border-t border-slate-100 pt-1.5 font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Total, before GST</dt>
          <dd className="border-t border-slate-100 pt-1.5 font-semibold tabular-nums text-slate-900 dark:border-slate-800 dark:text-slate-100 sm:text-right">{inr(a.historical.net + a.net)}</dd>
          <dt className="text-slate-500">With 18% GST on the fees since the CRM, plus the imported invoices as billed</dt>
          <dd className="tabular-nums text-slate-500 sm:text-right">{inr(a.historical.gross + a.net * 1.18)}</dd>
        </dl>
        <p className="mt-2 text-[12px] text-slate-400">The imported invoices carry no payment status, so they are history, not part of the stages above.</p>
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
        Amounts are before 18% GST. A duplicate, or a fee replaced while the person stayed placed, is voided and left out of every number{voided ? ` (${voided} such fee${voided === 1 ? "" : "s"})` : ""}. Figures as of {shortDate(a.asOf)}.
      </p>
    </div>
  );
}
