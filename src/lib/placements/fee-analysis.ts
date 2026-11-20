import type { SupabaseClient } from "@supabase/supabase-js";
import { GUARANTEE_DAYS, daysBetween } from "./drops";

// Fee analysis for the Placements page (admins). Every number comes from the fee tranches and the placements behind them.
//
// A fee moves through four stages, and these are the only ones shown:
//   potential   the candidate has joined (or is about to): the fee is expected, no invoice yet. Normally billed about 30 days after joining
//   billed      the invoice has gone out, not paid yet. Normally received 60 to 90 days after joining
//   received    paid by the client and kept
//   cancelled   the candidate left inside the 90-day guarantee, or the fee was cancelled. A fee that was paid first then shows as refund due
// Plus one that is never shown: voided = a duplicate or a fee that was replaced while the person stayed placed. Not revenue, so it is
// left out of every total.
//
// Amounts are rupees before GST.

export const BILL_BY_DAYS = 30;
export const COLLECT_FROM_DAYS = 60;
export const COLLECT_BY_DAYS = 90;
/** The cancel reason written when a fee is voided as a duplicate or a mistake. */
export const DUPLICATE_REASON = "Duplicate or entered by mistake";

export type FeeClass = "potential" | "billed" | "received" | "cancelled" | "refund_due" | "refunded" | "voided";
export type Stage = "potential" | "billed" | "received" | "cancelled";

/** The four stages a fee line belongs to (refund_due and refunded are cancelled fees). */
export const stageOf = (c: FeeClass): Stage | null => (c === "potential" ? "potential" : c === "billed" ? "billed" : c === "received" ? "received" : c === "voided" ? null : "cancelled");

export type FeeLine = {
  id: string;
  linkId: string;
  clientId: string | null;
  client: string;
  role: string;
  candidate: string;
  label: string;
  amount: number;
  cls: FeeClass;
  /** For a cancelled fee: the person left, or the fee itself was cancelled. */
  cancelKind: "left" | "other" | null;
  cancelReason: string | null;
  dueOn: string | null;
  invoicedOn: string | null;
  paidOn: string | null;
  joinedOn: string | null;
  daysSinceJoin: number | null;
  /** potential and past 30 days since joining: should have been billed. billed and past 90 days: should have been received. */
  late: "bill" | "collect" | null;
  /** Days past the due date for an unpaid fee, else 0. */
  daysOverdue: number;
};

export type Slice = { received: number; billed: number; potential: number; cancelled: number };

export type ClientRow = Slice & { client: string; placements: number; dropped_n: number; gross: number; net: number };
export type MonthRow = Slice & { month: string; placements: number; dropped_n: number; gross: number };
export type Bucket = { label: string; count: number; amount: number };
export type AtRisk = { linkId: string; candidateId: string; candidate: string; client: string; role: string; joined: string; daysLeft: number; atStake: number };
export type Historical = { count: number; net: number; gross: number; byClient: { client: string; count: number; net: number }[]; oldest: string | null; newest: string | null };
export type StageSummary = { count: number; amount: number; late: number; lateAmount: number };

export type FeeAnalysis = {
  asOf: string;
  historical: Historical;
  lines: FeeLine[];
  placements: number;
  droppedPlacements: number;
  /** Everything booked: potential + billed + received + cancelled. */
  gross: number;
  /** Booked minus cancelled: what we still expect to keep. */
  net: number;
  potential: StageSummary;
  billed: StageSummary;
  received: StageSummary;
  cancelled: StageSummary & { left: number; other: number };
  overdue: number;
  overdueCount: number;
  refundDue: number;
  avgDaysJoinToBill: number | null;
  avgDaysJoinToCollect: number | null;
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
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
const monthOf = (iso: string | null) => (iso ? iso.slice(0, 7) : "No joining date");
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

/** A tracker row's single fee label, from the raw tranche fields. */
export function feeStageFromRow(status: string, paidAt: string | null, cancelledAt: string | null): Stage {
  if (status === "cancelled" || cancelledAt) return "cancelled";
  if (paidAt) return "received";
  if (status === "proforma_sent" || status === "final_invoiced") return "billed";
  return "potential";
}

export async function loadFeeAnalysis(admin: SupabaseClient): Promise<FeeAnalysis> {
  const asOf = istToday();
  const { data: tr } = await admin
    .from("placement_fee_tranches")
    .select("id, link_id, label, amount_lakhs, due_date, status, proforma_sent_at, payment_received_at, final_invoiced_at, cancelled_at, cancel_reason, refund_due, refund_settled_at, mandates(client_id, client_name, role_title)")
    .limit(5000);
  type T = { id: string; link_id: string; label: string | null; amount_lakhs: number | string | null; due_date: string | null; status: string; proforma_sent_at: string | null; payment_received_at: string | null; final_invoiced_at: string | null; cancelled_at: string | null; cancel_reason: string | null; refund_due: boolean; refund_settled_at: string | null; mandates: One<{ client_id: string | null; client_name: string | null; role_title: string | null }> };
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

  const isDropped = (l: L) => !!l.dropped_at || l.join_status === "did_not_join" || l.stage === "pulled_back" || l.stage === "rejected";
  const dropDay = (l: L) => l.dropped_at ?? (l.join_status === "did_not_join" ? null : l.stage_updated_at ? l.stage_updated_at.slice(0, 10) : null);
  const liveCountByLink = new Map<string, number>();
  for (const t of tranches) if (t.status !== "cancelled" && !t.cancelled_at) liveCountByLink.set(t.link_id, (liveCountByLink.get(t.link_id) ?? 0) + 1);

  const lines: FeeLine[] = [];
  for (const t of tranches) {
    const l = links.get(t.link_id);
    const m = one(t.mandates) ?? one(l?.mandates ?? null);
    const amount = Number(t.amount_lakhs ?? 0);
    const cancelled = t.status === "cancelled" || !!t.cancelled_at;
    const dropped = l ? isDropped(l) : false;
    let cls: FeeClass;
    let cancelKind: FeeLine["cancelKind"] = null;
    if (cancelled) {
      // A duplicate, or an old fee replaced by a new one while the person stayed placed, is not a real cancellation.
      const replaced = !t.cancel_reason && !dropped && (liveCountByLink.get(t.link_id) ?? 0) > 0;
      if (t.cancel_reason === DUPLICATE_REASON || replaced) cls = "voided";
      else {
        cancelKind = dropped ? "left" : "other";
        cls = t.refund_due ? (t.refund_settled_at ? "refunded" : "refund_due") : "cancelled";
      }
    } else if (t.payment_received_at) cls = "received";
    else if (t.status === "proforma_sent" || t.status === "final_invoiced") cls = "billed";
    else cls = "potential";
    const invoicedOn = (t.proforma_sent_at ?? t.final_invoiced_at)?.slice(0, 10) ?? null;
    const joinedOn = l?.date_of_joining ?? null;
    const daysSinceJoin = joinedOn ? daysBetween(joinedOn, asOf) : null;
    const unpaid = cls === "billed" || cls === "potential";
    lines.push({
      id: t.id,
      linkId: t.link_id,
      clientId: m?.client_id ?? null,
      client: m?.client_name ?? "Unknown client",
      role: m?.role_title ?? "Role",
      candidate: one(l?.candidates ?? null)?.full_name ?? "Unknown",
      label: t.label ?? "Placement",
      amount,
      cls,
      cancelKind,
      cancelReason: t.cancel_reason,
      dueOn: t.due_date,
      invoicedOn,
      paidOn: t.payment_received_at ? t.payment_received_at.slice(0, 10) : null,
      joinedOn,
      daysSinceJoin,
      late: cls === "potential" && daysSinceJoin !== null && daysSinceJoin > BILL_BY_DAYS ? "bill" : cls === "billed" && daysSinceJoin !== null && daysSinceJoin > COLLECT_BY_DAYS ? "collect" : null,
      daysOverdue: unpaid && t.due_date && t.due_date < asOf ? daysBetween(t.due_date, asOf) : 0,
    });
  }

  const real = lines.filter((x) => x.cls !== "voided");
  const sum = (xs: FeeLine[]) => xs.reduce((s, x) => s + x.amount, 0);
  const inStage = (s: Stage) => real.filter((x) => stageOf(x.cls) === s);
  const summary = (xs: FeeLine[]): StageSummary => {
    const late = xs.filter((x) => x.late);
    return { count: xs.length, amount: sum(xs), late: late.length, lateAmount: sum(late) };
  };
  const potential = summary(inStage("potential"));
  const billed = summary(inStage("billed"));
  const received = summary(inStage("received"));
  const cancelledLines = inStage("cancelled");
  const cancelled = { ...summary(cancelledLines), left: sum(cancelledLines.filter((x) => x.cancelKind === "left")), other: sum(cancelledLines.filter((x) => x.cancelKind === "other")) };
  const gross = sum(real);
  const overdueLines = real.filter((x) => x.daysOverdue > 0);

  const feeLinks = new Set(linkIds);
  const universe = [...links.values()].filter((l) => l.stage === "placed" || feeLinks.has(l.id));
  const droppedPlacements = universe.filter(isDropped).length;

  const bySlice = (x: FeeLine, s: Slice) => {
    const st = stageOf(x.cls);
    if (st) s[st] += x.amount;
  };
  const empty = (): Slice => ({ received: 0, billed: 0, potential: 0, cancelled: 0 });

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
  const clients = [...clientMap.values()].map((c) => ({ ...c, net: c.gross - c.cancelled })).sort((a, b) => b.gross - a.gross);

  const monthMap = new Map<string, MonthRow>();
  for (const l of universe) {
    const k = monthOf(l.date_of_joining);
    const mrow = monthMap.get(k) ?? { month: k, placements: 0, dropped_n: 0, gross: 0, ...empty() };
    mrow.placements++;
    if (isDropped(l)) mrow.dropped_n++;
    monthMap.set(k, mrow);
  }
  for (const x of real) {
    const k = monthOf(x.joinedOn);
    const mrow = monthMap.get(k) ?? { month: k, placements: 0, dropped_n: 0, gross: 0, ...empty() };
    bySlice(x, mrow);
    mrow.gross += x.amount;
    monthMap.set(k, mrow);
  }
  const months = [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));

  const bucket = (label: string, xs: FeeLine[]): Bucket => ({ label, count: xs.length, amount: sum(xs) });
  const unpaid = real.filter((x) => x.cls === "billed" || x.cls === "potential");
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

  const atRisk: AtRisk[] = [];
  for (const l of universe) {
    if (l.stage !== "placed" || !l.date_of_joining) continue;
    const left = GUARANTEE_DAYS - daysBetween(l.date_of_joining, asOf);
    if (left < 0 || isDropped(l)) continue;
    atRisk.push({ linkId: l.id, candidateId: l.candidate_id, candidate: one(l.candidates)?.full_name ?? "Unknown", client: one(l.mandates)?.client_name ?? "Unknown client", role: one(l.mandates)?.role_title ?? "Role", joined: l.date_of_joining, daysLeft: left, atStake: feeOf(l).filter((x) => stageOf(x.cls) !== "cancelled").reduce((a, x) => a + x.amount, 0) });
  }
  atRisk.sort((a, b) => a.daysLeft - b.daysLeft);

  // Imported pre-CRM invoices: no payment status, so they are history here. They are summed so this page ties out to Analytics > Revenue.
  const { data: hist } = await admin.from("historical_invoices").select("invoice_date, gross_amount, net_amount, clients(name)").not("client_id", "is", null).not("invoice_date", "is", null).limit(5000);
  const hMap = new Map<string, { client: string; count: number; net: number }>();
  let hNet = 0, hGross = 0, hOld: string | null = null, hNew: string | null = null;
  for (const h of (hist ?? []) as unknown as { invoice_date: string; gross_amount: number | string | null; net_amount: number | string | null; clients: One<{ name: string | null }> }[]) {
    const name = one(h.clients)?.name ?? "Unknown client";
    const row = hMap.get(name) ?? { client: name, count: 0, net: 0 };
    row.count++;
    row.net += Number(h.net_amount ?? 0);
    hMap.set(name, row);
    hNet += Number(h.net_amount ?? 0);
    hGross += Number(h.gross_amount ?? 0);
    if (!hOld || h.invoice_date < hOld) hOld = h.invoice_date;
    if (!hNew || h.invoice_date > hNew) hNew = h.invoice_date;
  }
  const historical: Historical = { count: [...hMap.values()].reduce((s, r) => s + r.count, 0), net: hNet, gross: hGross, byClient: [...hMap.values()].sort((a, b) => b.net - a.net), oldest: hOld, newest: hNew };

  const billedOrPaid = real.filter((x) => (x.cls === "billed" || x.cls === "received") && x.invoicedOn && x.joinedOn);
  const paid = real.filter((x) => x.cls === "received" && x.paidOn && x.joinedOn);
  const a: FeeAnalysis = {
    asOf, historical, lines, placements: universe.length, droppedPlacements, gross, net: gross - cancelled.amount,
    potential, billed, received, cancelled, overdue: sum(overdueLines), overdueCount: overdueLines.length, refundDue: sum(real.filter((x) => x.cls === "refund_due")),
    avgDaysJoinToBill: avg(billedOrPaid.map((x) => daysBetween(x.joinedOn!, x.invoicedOn!))),
    avgDaysJoinToCollect: avg(paid.map((x) => daysBetween(x.joinedOn!, x.paidOn!))),
    clients, months, aging, forecast, dropTiming, reasons, atRisk, insights: [],
  };
  a.insights = insights(a);
  return a;
}

// Plain sentences about what the numbers say, so the page starts with a reading and not just a table.
function insights(a: FeeAnalysis): string[] {
  const out: string[] = [];
  if (a.gross === 0) return ["No fees have been booked yet."];
  const dr = pct(a.droppedPlacements, a.placements);
  if (a.droppedPlacements > 0 && dr !== null) out.push(`${a.droppedPlacements} of ${a.placements} placements dropped (${dr}%). The fees cancelled for it come to ${inr(a.cancelled.left)}, ${pct(a.cancelled.left, a.gross)}% of everything booked.`);
  else out.push(`No placement has dropped. All ${inr(a.gross)} booked is still live.`);
  if (a.received.amount === 0) out.push(`Nothing has been received yet. ${inr(a.net)} is still expected: ${inr(a.billed.amount)} billed and waiting, ${inr(a.potential.amount)} potential (joined, not billed yet).`);
  else out.push(`${inr(a.received.amount)} received, ${pct(a.received.amount, a.gross)}% of everything booked and ${pct(a.received.amount, a.net)}% of what is still expected.`);
  if (a.potential.late > 0) out.push(`${a.potential.late} potential fee${a.potential.late === 1 ? " is" : "s are"} past ${BILL_BY_DAYS} days since joining without a bill (${inr(a.potential.lateAmount)}). Bill ${a.potential.late === 1 ? "it" : "them"} now.`);
  if (a.billed.late > 0) out.push(`${a.billed.late} billed fee${a.billed.late === 1 ? " is" : "s are"} past ${COLLECT_BY_DAYS} days since joining and still unpaid (${inr(a.billed.lateAmount)}). Chase ${a.billed.late === 1 ? "it" : "them"}.`);
  else if (a.overdueCount > 0) {
    const worst = [...a.lines].filter((x) => x.daysOverdue > 0).sort((x, y) => y.daysOverdue - x.daysOverdue)[0];
    out.push(`${a.overdueCount} unpaid fee${a.overdueCount === 1 ? " is" : "s are"} past the due date (${inr(a.overdue)}). The longest, ${worst.client} for ${worst.candidate}, is ${worst.daysOverdue} days late.`);
  }
  const worstClient = [...a.clients].filter((c) => c.placements >= 1 && c.dropped_n > 0).sort((x, y) => y.dropped_n / y.placements - x.dropped_n / x.placements)[0];
  if (worstClient) out.push(`${worstClient.client} has the highest drop rate: ${worstClient.dropped_n} of ${worstClient.placements} placed (${pct(worstClient.dropped_n, worstClient.placements)}%).`);
  if (a.atRisk.length > 0) {
    const stake = a.atRisk.reduce((s, r) => s + r.atStake, 0);
    out.push(`${a.atRisk.length} placement${a.atRisk.length === 1 ? " is" : "s are"} still inside the ${GUARANTEE_DAYS}-day guarantee with ${inr(stake)} at stake. Soonest to clear: ${a.atRisk[0].candidate} in ${a.atRisk[0].daysLeft} days.`);
  }
  if (a.refundDue > 0) out.push(`${inr(a.refundDue)} was paid and now has to be refunded.`);
  return out;
}
