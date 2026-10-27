import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { EMAIL_RE, adminDb } from "@/lib/pro-sessions/core";
import { reportForBooking, standaloneReport } from "@/lib/session-report/store";

export const dynamic = "force-dynamic";

// Starts a session report: for a paid booking (filled from the booking and the details form), or on its own for someone
// who did not book through the site. Admin only.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { bookingId?: string; name?: string; email?: string; phone?: string };
  if (b.bookingId && /^[0-9a-f-]{36}$/i.test(b.bookingId)) {
    const r = await reportForBooking(db, b.bookingId);
    return r ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  const name = (b.name ?? "").trim();
  if (name.length < 2) return NextResponse.json({ error: "Enter the candidate's name." }, { status: 400 });
  const email = (b.email ?? "").trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  const r = await standaloneReport(db, { name, email: email || null, phone: (b.phone ?? "").trim().slice(0, 30) || null });
  return r ? NextResponse.json({ ok: true, id: r.id }) : NextResponse.json({ error: "Couldn't create the report." }, { status: 500 });
}
