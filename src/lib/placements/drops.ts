import type { SupabaseClient } from "@supabase/supabase-js";

// Placements that fell through inside the 90-day guarantee, and what happened to their fee. A placement counts as dropped when
// it was marked dropped, the person never joined, or it was pulled back after a joining date was set. People who a check-in
// says have left (attrited) but whose billing is still live are listed too, because that is the case that needs an action.

export const GUARANTEE_DAYS = 90;

export type DroppedFee = {
  id: string;
  /** Rupees before GST (the column is called amount_lakhs but holds rupees). Only filled for admins. */
  amount: number | null;
  status: string;
  paidAt: string | null;
  refundDue: boolean;
  refundSettledAt: string | null;
  invoiceEmailedAt: string | null;
  invoiceNumber: string | null;
};

export type DroppedRow = {
  linkId: string;
  candidateId: string;
  mandateId: string;
  candidate: string;
  client: string;
  role: string;
  joined: string | null;
  droppedOn: string | null;
  daysIn: number | null;
  reason: string;
  /** dropped: recorded. did_not_join: never started. attrited: a check-in says they left but nothing was cancelled yet. */
  kind: "dropped" | "did_not_join" | "attrited";
  /** Marked dropped here (dropped_at set), so it can be undone. */
  recorded: boolean;
  stage: string;
  fees: DroppedFee[];
  /** Any fee still live (not cancelled): billing has not been stopped. */
  billingLive: boolean;
};

export const daysBetween = (from: string, to: string) => Math.round((new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000);

type One<T> = T | T[] | null;
const one = <T,>(v: One<T>): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/** `supabase` is the viewer's session (list of people); `admin` is the service client, passed only for admins so fees and amounts stay hidden from everyone else. */
export async function loadDropped(supabase: SupabaseClient, admin: SupabaseClient | null): Promise<DroppedRow[]> {
  const cols = "id, candidate_id, mandate_id, stage, date_of_joining, join_status, join_status_updated_at, dropped_at, drop_reason, stage_updated_at, candidates(full_name), mandates(role_title, client_name)";
  const [dropped, attrited] = await Promise.all([
    supabase.from("candidate_mandate_links").select(cols).or("dropped_at.not.is.null,join_status.eq.did_not_join,and(stage.in.(pulled_back,rejected),date_of_joining.not.is.null)").limit(500),
    supabase.from("placement_retention_checkins").select(`link_id, completed_at, notes, candidate_mandate_links!inner(${cols})`).eq("outcome", "attrited").limit(500),
  ]);

  type L = { id: string; candidate_id: string; mandate_id: string; stage: string; date_of_joining: string | null; join_status: string | null; join_status_updated_at: string | null; dropped_at: string | null; drop_reason: string | null; stage_updated_at: string | null; candidates: One<{ full_name: string | null }>; mandates: One<{ role_title: string | null; client_name: string | null }> };
  const byId = new Map<string, { l: L; kind: DroppedRow["kind"]; leftOn: string | null; note: string | null }>();
  for (const l of (dropped.data ?? []) as unknown as L[]) {
    if (!l.date_of_joining && !l.dropped_at) continue;
    const kind: DroppedRow["kind"] = l.dropped_at ? "dropped" : l.join_status === "did_not_join" ? "did_not_join" : "dropped";
    const leftOn = l.dropped_at ?? (l.join_status === "did_not_join" ? l.join_status_updated_at : l.stage_updated_at);
    byId.set(l.id, { l, kind, leftOn: leftOn ? leftOn.slice(0, 10) : null, note: null });
  }
  for (const c of (attrited.data ?? []) as unknown as { link_id: string; completed_at: string | null; notes: string | null; candidate_mandate_links: One<L> }[]) {
    const l = one(c.candidate_mandate_links);
    if (!l || byId.has(l.id) || l.stage !== "placed") continue;
    byId.set(l.id, { l, kind: "attrited", leftOn: c.completed_at ? c.completed_at.slice(0, 10) : null, note: c.notes });
  }

  const ids = [...byId.keys()];
  const fees = new Map<string, DroppedFee[]>();
  if (admin && ids.length) {
    const { data } = await admin
      .from("placement_fee_tranches")
      .select("id, link_id, amount_lakhs, status, payment_received_at, refund_due, refund_settled_at, proforma_emailed_at, final_emailed_at, proforma_invoice_number, final_invoice_number")
      .in("link_id", ids);
    for (const t of (data ?? []) as { id: string; link_id: string; amount_lakhs: number | string | null; status: string; payment_received_at: string | null; refund_due: boolean; refund_settled_at: string | null; proforma_emailed_at: string | null; final_emailed_at: string | null; proforma_invoice_number: string | null; final_invoice_number: string | null }[]) {
      const arr = fees.get(t.link_id) ?? [];
      arr.push({
        id: t.id,
        amount: Number(t.amount_lakhs ?? 0),
        status: t.status,
        paidAt: t.payment_received_at,
        refundDue: t.refund_due,
        refundSettledAt: t.refund_settled_at,
        invoiceEmailedAt: t.final_emailed_at ?? t.proforma_emailed_at,
        invoiceNumber: t.final_invoice_number ?? t.proforma_invoice_number,
      });
      fees.set(t.link_id, arr);
    }
  }

  const rows: DroppedRow[] = [];
  for (const [id, { l, kind, leftOn, note }] of byId) {
    const joined = l.date_of_joining;
    const daysIn = joined && leftOn ? daysBetween(joined, leftOn) : null;
    // After the guarantee the fee stands, so those are not "dropped within 90 days" (a recorded drop is always within it).
    if (kind !== "dropped" || !l.dropped_at) if (daysIn !== null && daysIn > GUARANTEE_DAYS) continue;
    const f = fees.get(id) ?? [];
    rows.push({
      linkId: id,
      candidateId: l.candidate_id,
      mandateId: l.mandate_id,
      candidate: one(l.candidates)?.full_name ?? "Unknown",
      client: one(l.mandates)?.client_name ?? "Unknown client",
      role: one(l.mandates)?.role_title ?? "Role",
      joined,
      droppedOn: leftOn,
      daysIn,
      reason: l.drop_reason ?? note ?? (kind === "did_not_join" ? "Never joined" : kind === "attrited" ? "Left, logged at a retention check-in" : "Pulled back after a joining date was set"),
      kind,
      recorded: !!l.dropped_at,
      stage: l.stage,
      fees: f,
      billingLive: f.some((x) => x.status !== "cancelled"),
    });
  }
  return rows.sort((a, b) => (b.droppedOn ?? "").localeCompare(a.droppedOn ?? ""));
}

const inrFmt = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** One plain line about the fee for a dropped placement. Non-admins never see amounts. */
export function billingLine(r: DroppedRow, isAdmin: boolean): { text: string; tone: "ok" | "warn" | "bad" } {
  if (!isAdmin) return { text: r.billingLive ? "Billing may still be running. An admin will check." : "Billing cancelled.", tone: r.billingLive ? "warn" : "ok" };
  if (r.fees.length === 0) return { text: "No fee had been raised.", tone: "ok" };
  if (r.billingLive) return { text: "Billing is still live. Cancel it.", tone: "bad" };
  const owed = r.fees.filter((f) => f.refundDue && !f.refundSettledAt);
  if (owed.length) return { text: `Billing cancelled. Already paid ${inrFmt(owed.reduce((s, f) => s + (f.amount ?? 0), 0))}: refund due to the client.`, tone: "bad" };
  if (r.fees.some((f) => f.refundDue)) return { text: "Billing cancelled. Refund paid back.", tone: "ok" };
  return { text: "Billing cancelled, nothing had been paid.", tone: "ok" };
}
