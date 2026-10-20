import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

// Pro Sessions payments are taken on jobs.staffanchor.com. That site calls these private endpoints with a shared
// secret, so only it can hold a time, link a payment and confirm a booking.
export function requireInternal(req: NextRequest): NextResponse | null {
  const secret = process.env.PRO_INTERNAL_SECRET;
  const given = req.headers.get("x-pro-secret") ?? "";
  if (!secret) return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return null;
}
