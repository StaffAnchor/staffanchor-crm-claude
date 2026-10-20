import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { finalizeResumeOrder } from "@/lib/resume-orders/finalize";

export const dynamic = "force-dynamic";

// Called by jobs.staffanchor.com after it has verified the Razorpay payment (browser callback or webhook).
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { orderId?: string; paymentId?: string };
  if (!b.orderId || !b.paymentId) return NextResponse.json({ ok: false, error: "Missing payment details." }, { status: 400 });
  const r = await finalizeResumeOrder(db, b.orderId, b.paymentId);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
