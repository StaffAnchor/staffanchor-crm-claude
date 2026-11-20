import type { SupabaseClient } from "@supabase/supabase-js";
import { GUARANTEE_DAYS, daysBetween } from "./drops";

// Fee analysis for the Placements page (admins). Every number comes from the fee tranches and the placements behind them.
//
// How a fee is classed:
//   received      paid by the client and kept
//   waiting       invoice sent, not paid yet
//   not_invoiced  expected, no invoice yet
//   dropped       cancelled because the person left or never joined (lost fee)
//   refund_due    paid, then the placement dropped: money owed back
//   refunded      refund already paid back
//   voided        cancelled while the person is still placed (a fee that was replaced or corrected). Not revenue, so left out of every total
//
// Amounts are rupees before GST. A fee not yet invoiced is stored in lakhs (2.25 = 2.25 lakh) and invoicing later overwrites it with
// rupees, so a value under 1,000 is read as lakhs and marked as an estimate.

export type FeeClass = "received" | "waiting" | "not_invoiced" | "dropped" | "refund_due" | "refunded" | "voided";

export type FeeLine = {
  id: string;
  linkId: string;
  clientId: string | null;
  client: string;
  role: string;
  candidate: string;
  label: string;
  amount: number;
  estimated: boolean;
  cls: FeeClass;
  dueOn: string | null;
  invoicedOn: string | null;
  paidOn: string | null;
  /** Days past the due date for an unpaid fee, else 0. */
  daysOverdue: number;
};

export type Slice = { received: number; waiting: number; notInvoiced: number; dropped: number };

export type ClientRow = Slice & { client: string; placements: number; dropped_n: number; gross: number; net: number };
export type MonthRow = Slice & { month: string; placements: number; dropped_n: number; gross: number };
export type Bucket = { label: string; count: number; amount: number };
export type AtRisk = { linkId: string; candidateId: string; candidate: string; client: string; role: string; joined: string; daysLeft: number; atStake: number };

export type FeeAnalysis = {
  asOf: string;
  lines: FeeLine[];
  placements: number;
  droppedPlacements: number;
  gross: number;
  dropped: number;
  net: number;
  received: number;
  waiting: number;
  notInvoiced: number;
  overdue: number;
  overdueCount: number;
  refundDue: number;
  estimatedCount: number;
  avgDaysToCollect: number | null;
  avgDaysToInvoice: number | null;
  clients: ClientRow[];
  months: MonthRow[];
  aging: Bucket[];
  forecast: Bucket[];
  dropTiming: Bucket[];
  reasons: Bucket[];
  atRisk: AtRisk[];
  insights: string[];
};

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const istToday = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const norm = (raw: number) => (raw > 0 && raw < 1000 ? { amount: Math.round(raw * 100_000), estimated: true } : { amount: raw, estimated: false });
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const monthOf = (iso: string | null) => (iso ? iso.slice(0, 7) : "No joining date");
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export async function loadFeeAnalysis(admin: SupabaseClient): Promise<FeeAnalysis> {
  const asOf = istToday();
  const { data: tr } = await admin
    .from("placement_fee_tranches")
    .select("id, link_id, label, amount_lakhs, due_date, status, proforma_sent_at, payment_received_at, final_invoiced_at, cancelled_at, refund_due, refund_settled_at, mandates(client_id, client_name, role_title)")
    .limit(5000);
  type T = { id: string; link_id: string; label: string | null; amount_lakhs: number | string | null; due_date: string | null; status: string; proforma_sent_at: string | null; payment_received_at: string | null; final_invoiced_at: string | null; cancelled_at: string | null; refund_due: boolean; refund_settled_at: string | null; mandates: One<{ client_id: string | null; client_name: string | null; role_title: string | null }> };
  const tranches = (tr ?? []) as unknown as T[];
  const linkIds = [...new Set(tranches.map((t) => t.link_id))];

  const cols = "id, candidate_id, mandate_id, stage, date_of_joining, join_status, dropped_at, drop_reason, stage_updated_at, candidates(full_name), mandates(client_id, client_name, role_title)";
  const [placed, withFees] = await Promise.all([
    admin.from("candidate_mandate_links").select(cols).eq("stage", "placed").limit(2000),
    linkIds.length ? admin.from("candidate_mandate_links").select(cols).in("id", linkIds).limit(5000) : Promise.resolve({ data: [] as unknown[] }),
  ]);
  type L = { id: string; candidate_id: string; mandate_id: string; stage: string; date_of_joining: string | null; join_status: string | null; dropped_at: string | null; drop_reason: string | null; stage_updated_at: string | null; candidates: One<{ full_name: string | null }>; mandates: One<{ client_id: string | null; client_name: string | null; role_title: string | null }> };
  const links = new Map<string, L>();
  for (const l of [...((placed.data ?? []) as unknown as L[]), ...((withFees.data ?? []) as unknown as L[])]) links.set(l.id, l);

  // Which placements dropped, and on what day.
  const isDropped = (l: L) => !!l.dropped_at || l.join_status === "did_not_join" || l.stage === "pulled_back" || l.stage === "rejected";
  const dropDay = (l: L) => l.dropped_at ?? (l.join_status === "did_not_join" ? null : l.stage_updated_at ? l.stage_updated_at.slice(0, 10) : null);

  const lines: FeeLine[] = [];
  for (const t of tranches) {
    const l = links.get(t.link_id);
    const m = one(t.mandates) ?? one(l?.mandates ?? null);
    const raw = Number(t.amount_lakhs ?? 0);
    const { amount, estimated } = norm(raw);
    const cancelled = t.status === "cancelled" || !!t.cancelled_at;
    const dropped = l ? isDropped(l) : false;
    let cls: FeeClass;
    if (cancelled) cls = !dropped ? "voided" : t.refund_due ? (t.refund_settled_at ? "refunded" : "refund_due") : "dropped";
    else if (t.payment_received_at) cls = "received";
    else if (t.status === "proforma_sent" || t.status === "final_invoiced") cls = "waiting";
    else cls = "not_invoiced";
    const invoicedOn = (t.proforma_sent_at ?? t.final_invoiced_at)?.slice(0, 10) ?? null;
    const unpaid = cls === "waiting" || cls === "not_invoiced";
    lines.push({
      id: t.id,
      linkId: t.link_id,
      clientId: m?.client_id ?? null,
      client: m?.client_name ?? "Unknown client",
      role: m?.role_title ?? "Role",
      candidate: one(l?.candidates ?? null)?.full_name ?? "Unknown",
      label: t.label ?? "Placement",
      amount,
      estimated,
      cls,
      dueOn: t.due_date,
      invoicedOn,
      paidOn: t.payment_received_at ? t.payment_received_at.slice(0, 10) : null,
      daysOverdue: unpaid && t.due_date && t.due_date < asOf ? daysBetween(t.due_date, asOf) : 0,
    });
  }

  const real = lines.filter((x) => x.cls !== "voided");
  const sum = (xs: FeeLine[]) => xs.reduce((s, x) => s + x.amount, 0);
  const is = (...c: FeeClass[]) => real.filter((x) => c.includes(x.cls));
  const gross = sum(real);
  const lostLines = is("dropped", "refund_due", "refunded");
  const dropped = sum(lostLines);
  const received = sum(is("received"));
  const waiting = sum(is("waiting"));
  const notInvoiced = sum(is("not_invoiced"));
  const overdueLines = real.filter((x) => x.daysOverdue > 0);

  // Placements: everyone placed now plus everyone who dropped after being placed (a fee on record is the evidence).
  const feeLinks = new Set(linkIds);
  const universe = [...links.values()].filter((l) => l.stage === "placed" || feeLinks.has(l.id));
  const droppedPlacements = universe.filter(isDropped).length;

  const bySlice = (x: FeeLine, s: Slice) => {
    if (x.cls === "received") s.received += x.amount;
    else if (x.cls === "waiting") s.waiting += x.amount;
    else if (x.cls === "not_invoiced") s.notInvoiced += x.amount;
    else if (x.cls === "dropped" || x.cls === "refund_due" || x.cls === "refunded") s.dropped += x.amount;
  };
  const empty = (): Slice => ({ received: 0, waiting: 0, notInvoiced: 0, dropped: 0 });

  const clientMap = new Map<string, ClientRow>();
  for (const l of universe) {
    const name = one(l.mandates)?.client_name ?? "Unknown client";
    const c = clientMap.get(name) ?? { client: name, placements: 0, dropped_n: 0, gross: 0, net: 0, ...empty() };
    c.placements++;
    if (isDropped(l)) c.dropped_n++;
    clientMap.set(name, c);
  }
  for (const x of real) {
    const c = clientMap.get(x.client) ?? { client: x.client, placements: 0, dropped_n: 0, gross: 0, net: 0, ...empty() };
    bySlice(x, c);
    c.gross += x.amount;
    clientMap.set(x.client, c);
  }
  const clients = [...clientMap.values()].map((c) => ({ ...c, net: c.gross - c.dropped })).sort((a, b) => b.gross - a.gross);

  const monthMap = new Map<string, MonthRow>();
  for (const l of universe) {
    const k = monthOf(l.date_of_joining);
    const mrow = monthMap.get(k) ?? { month: k, placements: 0, dropped_n: 0, gross: 0, ...empty() };
    mrow.placements++;
    if (isDropped(l)) mrow.dropped_n++;
    monthMap.set(k, mrow);
  }
  for (const x of real) {
    const k = monthOf(links.get(x.linkId)?.date_of_joining ?? null);
    const mrow = monthMap.get(k) ?? { month: k, placements: 0, dropped_n: 0, gross: 0, ...empty() };
    bySlice(x, mrow);
    mrow.gross += x.amount;
    monthMap.set(k, mrow);
  }
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const bucket = (label: string, xs: FeeLine[]): Bucket => ({ label, count: xs.length, amount: sum(xs) });
  const unpaid = real.filter((x) => x.cls === "waiting" || x.cls === "not_invoiced");
  const aging = [
    bucket("Not due yet", unpaid.filter((x) => x.daysOverdue === 0)),
    bucket("1 to 30 days late", unpaid.filter((x) => x.daysOverdue >= 1 && x.daysOverdue <= 30)),
    bucket("31 to 60 days late", unpaid.filter((x) => x.daysOverdue >= 31 && x.daysOverdue <= 60)),
    bucket("61 to 90 days late", unpaid.filter((x) => x.daysOverdue >= 61 && x.daysOverdue <= 90)),
    bucket("Over 90 days late", unpaid.filter((x) => x.daysOverdue > 90)),
  ];
  const until = (x: FeeLine) => (x.dueOn ? daysBetween(asOf, x.dueOn) : 9999);
  const forecast = [
    bucket("Already due", unpaid.filter((x) => x.daysOverdue > 0)),
    bucket("Due in the next 30 days", unpaid.filter((x) => x.daysOverdue === 0 && until(x) <= 30)),
    bucket("Due in 31 to 60 days", unpaid.filter((x) => x.daysOverdue === 0 && until(x) > 30 && until(x) <= 60)),
    bucket("Due in 61 to 90 days", unpaid.filter((x) => x.daysOverdue === 0 && until(x) > 60 && until(x) <= 90)),
    bucket("Due later", unpaid.filter((x) => x.daysOverdue === 0 && until(x) > 90)),
  ];

  // When people leave: by days after joining.
  const dropLinks = universe.filter(isDropped);
  const days = (l: L) => (l.date_of_joining && dropDay(l) ? daysBetween(l.date_of_joining, dropDay(l)!) : null);
  const feeOf = (l: L) => lines.filter((x) => x.linkId === l.id && x.cls !== "voided");
  const tb = (label: string, ls: L[]): Bucket => ({ label, count: ls.length, amount: ls.reduce((s, l) => s + feeOf(l).reduce((a, x) => a + x.amount, 0), 0) });
  const known = (l: L) => !!l.dropped_at || l.join_status === "did_not_join" || ((days(l) ?? 0) <= GUARANTEE_DAYS);
  const dropTiming = [
    tb("Never joined", dropLinks.filter((l) => l.join_status === "did_not_join")),
    tb("Days 0 to 30", dropLinks.filter((l) => l.join_status !== "did_not_join" && known(l) && days(l) !== null && days(l)! <= 30)),
    tb("Days 31 to 60", dropLinks.filter((l) => l.join_status !== "did_not_join" && known(l) && days(l) !== null && days(l)! > 30 && days(l)! <= 60)),
    tb("Days 61 to 90", dropLinks.filter((l) => l.join_status !== "did_not_join" && known(l) && days(l) !== null && days(l)! > 60 && days(l)! <= 90)),
    tb("Day not recorded", dropLinks.filter((l) => l.join_status !== "did_not_join" && (!known(l) || days(l) === null))),
  ];
  const reasonMap = new Map<string, Bucket>();
  for (const l of dropLinks) {
    const r = (l.drop_reason ?? "Not recorded").split(":")[0].trim() || "Not recorded";
    const b = reasonMap.get(r) ?? { label: r, count: 0, amount: 0 };
    b.count++;
    b.amount += feeOf(l).reduce((a, x) => a + x.amount, 0);
    reasonMap.set(r, b);
  }
  const reasons = [...reasonMap.values()].sort((a, b) => b.count - a.count);

  // Still inside the guarantee: fee that could yet be lost.
  const atRisk: AtRisk[] = [];
  for (const l of universe) {
    if (l.stage !== "placed" || !l.date_of_joining) continue;
    const left = GUARANTEE_DAYS - daysBetween(l.date_of_joining, asOf);
    if (left < 0 || isDropped(l)) continue;
    atRisk.push({ linkId: l.id, candidateId: l.candidate_id, candidate: one(l.candidates)?.full_name ?? "Unknown", client: one(l.mandates)?.client_name ?? "Unknown client", role: one(l.mandates)?.role_title ?? "Role", joined: l.date_of_joining, daysLeft: left, atStake: feeOf(l).reduce((a, x) => a + x.amount, 0) });
  }
  atRisk.sort((a, b) => a.daysLeft - b.daysLeft);

  const paid = real.filter((x) => x.cls === "received" && x.paidOn && x.invoicedOn);
  const avgDaysToCollect = avg(paid.map((x) => daysBetween(x.invoicedOn!, x.paidOn!)));
  const invoiced = real.filter((x) => x.invoicedOn && links.get(x.linkId)?.date_of_joining);
  const avgDaysToInvoice = avg(invoiced.map((x) => daysBetween(links.get(x.linkId)!.date_of_joining!, x.invoicedOn!)));
  const refundDue = sum(is("refund_due"));
  const overdue = sum(overdueLines);

  const a: FeeAnalysis = {
    asOf, lines, placements: universe.length, droppedPlacements, gross, dropped, net: gross - dropped, received, waiting, notInvoiced, overdue, overdueCount: overdueLines.length, refundDue,
    estimatedCount: real.filter((x) => x.estimated).length, avgDaysToCollect, avgDaysToInvoice, clients, months, aging, forecast, dropTiming, reasons, atRisk, insights: [],
  };
  a.insights = insights(a);
  return a;
}

// Plain sentences about what the numbers say, so the page starts with a reading and not just a table.
function insights(a: FeeAnalysis): string[] {
  const out: string[] = [];
  if (a.gross === 0) return ["No fees have been booked yet."];
  const dr = pct(a.droppedPlacements, a.placements);
  if (a.droppedPlacements > 0 && dr !== null) out.push(`${a.droppedPlacements} of ${a.placements} placements dropped (${dr}%), which cost ${inr(a.dropped)}, ${pct(a.dropped, a.gross)}% of all fees booked.`);
  else out.push(`No placement has dropped. All ${inr(a.gross)} booked is still live.`);
  if (a.received === 0) out.push(`Nothing has been collected yet. ${inr(a.net)} is expected: ${inr(a.waiting)} invoiced and waiting, ${inr(a.notInvoiced)} not invoiced yet.`);
  else out.push(`${inr(a.received)} collected, ${pct(a.received, a.gross)}% of everything booked and ${pct(a.received, a.net)}% of what is still expected after drops.`);
  if (a.overdueCount > 0) {
    const worst = [...a.lines].filter((x) => x.daysOverdue > 0).sort((x, y) => y.daysOverdue - x.daysOverdue)[0];
    out.push(`${a.overdueCount} unpaid fee${a.overdueCount === 1 ? " is" : "s are"} past the due date (${inr(a.overdue)}). The longest, ${worst.client} for ${worst.candidate}, is ${worst.daysOverdue} days late.`);
  }
  if (a.notInvoiced > 0) {
    const due = a.lines.filter((x) => x.cls === "not_invoiced" && x.dueOn && x.dueOn <= a.asOf);
    out.push(due.length ? `${inr(a.notInvoiced)} has no invoice yet, and ${due.length} of those ${due.length === 1 ? "is" : "are"} already due. Send ${due.length === 1 ? "it" : "them"} first.` : `${inr(a.notInvoiced)} has no invoice yet. None is due today.`);
  }
  const worstClient = [...a.clients].filter((c) => c.placements >= 1 && c.dropped_n > 0).sort((x, y) => y.dropped_n / y.placements - x.dropped_n / x.placements)[0];
  if (worstClient) out.push(`${worstClient.client} has the highest drop rate: ${worstClient.dropped_n} of ${worstClient.placements} placed (${pct(worstClient.dropped_n, worstClient.placements)}%).`);
  if (a.atRisk.length > 0) {
    const stake = a.atRisk.reduce((s, r) => s + r.atStake, 0);
    out.push(`${a.atRisk.length} placement${a.atRisk.length === 1 ? " is" : "s are"} still inside the 90-day guarantee with ${inr(stake)} at stake. Soonest to clear: ${a.atRisk[0].candidate} in ${a.atRisk[0].daysLeft} days.`);
  }
  if (a.refundDue > 0) out.push(`${inr(a.refundDue)} was paid and now has to be refunded.`);
  if (a.estimatedCount > 0) out.push(`${a.estimatedCount} fee${a.estimatedCount === 1 ? " is" : "s are"} an estimate (not invoiced, worked out from the fee in lakhs).`);
  return out;
}
