import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { verifyPaymentSignature } from "@/lib/pro-sessions/razorpay";
import { finalizeBooking } from "@/lib/pro-sessions/finalize";

export const dynamic = "force-dynamic";

// Called by the booking page after Razorpay Checkout succeeds. The signature proves the payment is real.
export async function POST(req: NextRequest) {
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; orderId?: string; paymentId?: string; signature?: string };
  if (!b.bookingId || !b.orderId || !b.paymentId || !b.signature) return NextResponse.json({ ok: false, error: "Missing payment details." }, { status: 400 });
  if (!verifyPaymentSignature(b.orderId, b.paymentId, b.signature)) return NextResponse.json({ ok: false, error: "Payment could not be verified." }, { status: 400 });
  const { data: row } = await db.from("pro_bookings").select("razorpay_order_id").eq("id", b.bookingId).maybeSingle();
  if (!row || row.razorpay_order_id !== b.orderId) return NextResponse.json({ ok: false, error: "Booking doesn't match the payment." }, { status: 400 });
  const r = await finalizeBooking(db, b.bookingId, b.paymentId);
  if (!r.ok || !r.booking) return NextResponse.json({ ok: false, error: r.error ?? "Couldn't confirm the booking." }, { status: 500 });
  return NextResponse.json({ ok: true, start: r.booking.slot_start, meetLink: r.booking.meet_link });
}
