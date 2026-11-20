import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { DUPLICATE_REASON } from "@/lib/placements/fee-analysis";

export const dynamic = "force-dynamic";

const DROP_REASON = "Dropped within 90 days of joining";
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const at = (d: string) => `${d}T12:00:00+05:30`;

// Admin only. Moves one fee between its stages. It writes to the same fee record that Analytics > Billing, Analytics > Revenue and the
// Placements tracker read, so a change here shows up everywhere. Stages: potential (status pending), billed (proforma_sent, or
// final_invoiced), received (a payment date is set), cancelled.
//   mark_billed     potential -> billed, with the invoice day and optionally the invoice number (for an invoice already sent)
//   unbill          billed -> potential (only if no invoice file was generated or emailed from Billing)
//   mark_received   the money came in on a given day (from billed, or straight from potential)
//   undo_received   take the payment back
//   cancel_fee      cancel a fee (the client cancelled it, a duplicate, or another reason). A paid fee is flagged refund due
//   restore_fee     bring a cancelled fee back to where it was (not for a fee cancelled by a drop: undo the drop on the placement)
// A candidate who left is recorded with Dropped on the placement, which cancels every fee at once.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = adminDb();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; feeId?: string; date?: string; invoiceNumber?: string; reason?: string; note?: string };
  const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
  if (!b.feeId) return fail("Which fee?");
  const { data: fee } = await admin
    .from("placement_fee_tranches")
    .select("id, link_id, status, payment_received_at, proforma_sent_at, cancelled_at, cancel_reason, cancelled_from_status, proforma_file_path, proforma_emailed_at")
    .eq("id", b.feeId)
    .maybeSingle();
  if (!fee) return fail("Fee not found.", 404);
  const cancelled = fee.status === "cancelled" || !!fee.cancelled_at;
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from("placement_fee_tranches").update(patch).eq("id", b.feeId!);
    return error ? fail(error.message.includes("duplicate key") ? "That invoice number is already used on another fee." : error.message, 500) : NextResponse.json({ ok: true });
  };

  if (b.action === "restore_fee") {
    if (!cancelled) return fail("This fee is not cancelled.");
    if (fee.cancel_reason === DROP_REASON) return fail("This fee was cancelled because the candidate dropped. Undo the drop on the placement (Dropped within 90 days, Undo) to bring it back.");
    const { data: link } = await admin.from("candidate_mandate_links").select("stage, dropped_at, join_status").eq("id", fee.link_id).maybeSingle();
    if (link && (link.dropped_at || link.stage === "pulled_back" || link.stage === "rejected" || link.join_status === "did_not_join")) return fail("This candidate has dropped, so the fee stays cancelled. Undo the drop on the placement first.");
    const status = fee.cancelled_from_status ?? (fee.payment_received_at ? "payment_received" : fee.proforma_sent_at ? "proforma_sent" : "pending");
    return save({ status, cancelled_at: null, cancel_reason: null, cancelled_from_status: null, refund_due: false, refund_settled_at: null });
  }

  if (cancelled) return fail("This fee is cancelled. Restore it first to change it.");

  if (b.action === "cancel_fee") {
    const why = b.reason === "client" ? "Cancelled by the client" : b.reason === "duplicate" ? DUPLICATE_REASON : String(b.note ?? "").trim().slice(0, 200);
    if (!why) return fail("Say why the fee is cancelled.");
    const note = b.reason !== "other" ? String(b.note ?? "").trim().slice(0, 200) : "";
    return save({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: note ? `${why}: ${note}` : why, cancelled_from_status: fee.status, refund_due: !!fee.payment_received_at && b.reason !== "duplicate" });
  }

  if (b.action === "mark_billed") {
    if (fee.payment_received_at) return fail("This fee is already paid.");
    if (fee.status !== "pending") return fail("This fee is already billed.");
    if (!isDate(b.date)) return fail("Pick the day the invoice went out.");
    if (b.date > today()) return fail("That date is in the future.");
    const patch: Record<string, unknown> = { status: "proforma_sent", proforma_sent_at: at(b.date) };
    const num = String(b.invoiceNumber ?? "").trim().slice(0, 60);
    if (num) patch.proforma_invoice_number = num;
    return save(patch);
  }

  if (b.action === "unbill") {
    if (fee.payment_received_at) return fail("This fee is paid. Take the payment back first.");
    if (fee.status !== "proforma_sent") return fail("This fee is not billed.");
    if (fee.proforma_file_path || fee.proforma_emailed_at) return fail("A proforma was generated or emailed for this fee from Billing. Handle it in Analytics, Billing.");
    return save({ status: "pending", proforma_sent_at: null, proforma_invoice_number: null });
  }

  if (b.action === "mark_received") {
    if (fee.payment_received_at) return fail("This fee is already marked as received.");
    if (!isDate(b.date)) return fail("Pick the day the money came in.");
    if (b.date > today()) return fail("That date is in the future.");
    const patch: Record<string, unknown> = { payment_received_at: at(b.date) };
    // Same rule as Billing: a proforma moves to "payment received"; a fee already tax-invoiced only gets the payment date.
    if (fee.status === "proforma_sent" || fee.status === "pending") patch.status = "payment_received";
    return save(patch);
  }

  if (b.action === "undo_received") {
    if (!fee.payment_received_at) return fail("This fee is not marked as received.");
    const patch: Record<string, unknown> = { payment_received_at: null };
    if (fee.status === "payment_received") patch.status = fee.proforma_sent_at ? "proforma_sent" : "pending";
    return save(patch);
  }

  return fail("Unknown action.");
}
