import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { finalizeBooking } from "@/lib/pro-sessions/finalize";

export const dynamic = "force-dynamic";

// Step 3: jobs.staffanchor.com has verified the Razorpay payment (browser callback or webhook). Confirms the
// booking, creates the Meet event and sends the confirmation. Safe to call twice.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; orderId?: string; paymentId?: string };
  if (!b.orderId || !b.paymentId) return NextResponse.json({ ok: false, error: "Missing payment details." }, { status: 400 });
  // Found by order, so a payment can only ever confirm the booking it was opened for.
  const { data: row } = await db.from("pro_bookings").select("id").eq("razorpay_order_id", b.orderId).maybeSingle();
  if (!row || (b.bookingId && row.id !== b.bookingId)) return NextResponse.json({ ok: false, error: "Booking doesn't match the payment." }, { status: 400 });
  const r = await finalizeBooking(db, row.id, b.paymentId);
  if (!r.ok || !r.booking) return NextResponse.json({ ok: false, error: r.error ?? "Couldn't confirm the booking." }, { status: 500 });
  return NextResponse.json({ ok: true, start: r.booking.slot_start, meetLink: r.booking.meet_link });
}
