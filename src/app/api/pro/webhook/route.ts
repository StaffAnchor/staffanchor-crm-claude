import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { verifyWebhookSignature } from "@/lib/pro-sessions/razorpay";
import { finalizeBooking } from "@/lib/pro-sessions/finalize";

export const dynamic = "force-dynamic";

// Razorpay's own confirmation, in case the visitor closed the tab right after paying.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature") ?? "")) return NextResponse.json({ ok: false }, { status: 401 });
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const evt = JSON.parse(raw) as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  if (evt.event !== "payment.captured" && evt.event !== "order.paid") return NextResponse.json({ ok: true });
  const pay = evt.payload?.payment?.entity;
  if (!pay?.order_id || !pay.id) return NextResponse.json({ ok: true });
  const { data: row } = await db.from("pro_bookings").select("id").eq("razorpay_order_id", pay.order_id).maybeSingle();
  if (row) await finalizeBooking(db, row.id, pay.id);
  return NextResponse.json({ ok: true });
}
