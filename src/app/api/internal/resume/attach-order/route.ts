import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { orderRef?: string; orderId?: string; failed?: boolean };
  if (!b.orderRef) return NextResponse.json({ ok: false, error: "Missing order." }, { status: 400 });
  if (b.failed) {
    await db.from("resume_orders").update({ status: "failed" }).eq("id", b.orderRef).eq("status", "pending_payment");
    return NextResponse.json({ ok: true });
  }
  if (!b.orderId) return NextResponse.json({ ok: false, error: "Missing order." }, { status: 400 });
  await db.from("resume_orders").update({ razorpay_order_id: b.orderId }).eq("id", b.orderRef).eq("status", "pending_payment");
  return NextResponse.json({ ok: true });
}
