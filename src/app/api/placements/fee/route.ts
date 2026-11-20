import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";

export const dynamic = "force-dynamic";

const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const today = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);

// Admin only. Marking a fee received follows the same rule as Analytics > Billing: a proforma moves to "payment received" (the tax
// invoice is cut afterwards in Billing), and a fee that already has its tax invoice only gets the payment date.
//   mark_received   an invoiced fee has been paid, on the given day
//   undo_received   put it back (wrong fee or wrong day)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = adminDb();
  if (!admin) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; feeId?: string; receivedOn?: string };
  const fail = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });
  if (!b.feeId) return fail("Which fee?");
  const { data: fee } = await admin.from("placement_fee_tranches").select("id, status, payment_received_at, cancelled_at").eq("id", b.feeId).maybeSingle();
  if (!fee) return fail("Fee not found.", 404);
  if (fee.status === "cancelled" || fee.cancelled_at) return fail("This fee is cancelled.");

  if (b.action === "mark_received") {
    if (fee.payment_received_at) return fail("This fee is already marked as received.");
    if (fee.status === "pending") return fail("No invoice has gone out for this fee yet. Raise the proforma in Analytics, Billing first, then mark it received.");
    if (!isDate(b.receivedOn)) return fail("Pick the day the money came in.");
    if (b.receivedOn > today()) return fail("That date is in the future.");
    const patch: Record<string, unknown> = { payment_received_at: `${b.receivedOn}T12:00:00+05:30` };
    if (fee.status === "proforma_sent") patch.status = "payment_received";
    const { error } = await admin.from("placement_fee_tranches").update(patch).eq("id", b.feeId);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }

  if (b.action === "undo_received") {
    if (!fee.payment_received_at) return fail("This fee is not marked as received.");
    const patch: Record<string, unknown> = { payment_received_at: null };
    if (fee.status === "payment_received") patch.status = "proforma_sent";
    const { error } = await admin.from("placement_fee_tranches").update(patch).eq("id", b.feeId);
    return error ? fail(error.message, 500) : NextResponse.json({ ok: true });
  }
  return fail("Unknown action.");
}
