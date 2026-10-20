import { NextRequest, NextResponse } from "next/server";
import { EMAIL_RE, HOLD_MINUTES, adminDb, cleanPhone, istDate } from "@/lib/pro-sessions/core";
import { computeSlots } from "@/lib/pro-sessions/slots";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";

export const dynamic = "force-dynamic";

// Step 1 of a booking, called by jobs.staffanchor.com: checks the time is still free, holds it for 15 minutes and
// returns the booking and the amount to charge. The price always comes from here, never from the browser.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Booking isn't available right now." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const name = str("name", 120);
  const email = str("email", 200).toLowerCase();
  const phone = cleanPhone(str("phone", 30));
  const slug = str("service", 60);
  const slotStart = new Date(str("slotStart", 40));
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
  if (isNaN(slotStart.getTime())) return NextResponse.json({ ok: false, error: "Please pick a time." }, { status: 400 });

  const { data: svc } = await db.from("pro_services").select("slug, title, duration_min, price_inr").eq("slug", slug).eq("active", true).maybeSingle();
  if (!svc) return NextResponse.json({ ok: false, error: "Unknown service." }, { status: 404 });

  // The chosen time must still be free, checked now and not trusted from the browser.
  const free = await computeSlots(db, svc.duration_min, istDate(slotStart), 2);
  if (!free.ok) return NextResponse.json({ ok: false, error: free.error ?? "Availability is unavailable." }, { status: 503 });
  if (!Object.values(free.days).some((arr) => arr.includes(slotStart.toISOString()))) {
    return NextResponse.json({ ok: false, error: "That time was just taken. Please pick another." }, { status: 409 });
  }

  // A few unpaid holds per person at most, so the calendar can't be blocked with free holds.
  const holdFrom = new Date(Date.now() - HOLD_MINUTES * 60000).toISOString();
  const { count } = await db.from("pro_bookings").select("id", { count: "exact", head: true }).eq("status", "pending_payment").gte("created_at", holdFrom).or(`email.eq.${email},phone.eq.${phone}`);
  if ((count ?? 0) >= 2) return NextResponse.json({ ok: false, error: "You already have a time on hold. Finish that payment or wait a few minutes." }, { status: 429 });

  const { data: row, error } = await db
    .from("pro_bookings")
    .insert({
      service_slug: svc.slug, name, email, phone,
      target_role: str("targetRole", 200) || null,
      notes: str("notes", 1000) || null,
      slot_start: slotStart.toISOString(),
      slot_end: new Date(slotStart.getTime() + svc.duration_min * 60000).toISOString(),
      amount_inr: svc.price_inr, status: "pending_payment",
      source: str("src", 60) || null,
    })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ ok: false, error: "Couldn't hold that time. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true, bookingId: row.id, amountInr: svc.price_inr, title: svc.title });
}
