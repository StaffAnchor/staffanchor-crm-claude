import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";

export const dynamic = "force-dynamic";

// Step 2: records the Razorpay order that was opened for a held booking.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; orderId?: string; failed?: boolean };
  if (!b.bookingId) return NextResponse.json({ ok: false, error: "Missing booking." }, { status: 400 });
  if (b.failed) {
    await db.from("pro_bookings").update({ status: "failed" }).eq("id", b.bookingId).eq("status", "pending_payment");
    return NextResponse.json({ ok: true });
  }
  if (!b.orderId) return NextResponse.json({ ok: false, error: "Missing order." }, { status: 400 });
  await db.from("pro_bookings").update({ razorpay_order_id: b.orderId }).eq("id", b.bookingId).eq("status", "pending_payment");
  return NextResponse.json({ ok: true });
}
