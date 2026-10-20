import { NextRequest, NextResponse } from "next/server";
import { EMAIL_RE, HOLD_MINUTES, adminDb, cleanPhone, istDate } from "@/lib/pro-sessions/core";
import { computeSlots } from "@/lib/pro-sessions/slots";
import { createOrder, razorpayConfigured } from "@/lib/pro-sessions/razorpay";

export const dynamic = "force-dynamic";

// Holds a slot for 15 minutes and opens a Razorpay order for it. Nothing is confirmed until payment is verified.
export async function POST(req: NextRequest) {
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false, error: "Booking isn't available right now." }, { status: 503 });
  if (!razorpayConfigured()) return NextResponse.json({ ok: false, error: "Payments aren't switched on yet. Please check back soon." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string, max = 200) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  if (str("website")) return NextResponse.json({ ok: true }); // honeypot
  const name = str("name", 120);
  const email = str("email", 200).toLowerCase();
  const phone = cleanPhone(str("phone", 30));
  const slug = str("service", 60);
  const slotStart = new Date(str("slotStart", 40));
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  if (!phone) return NextResponse.json({ ok: false, error: "Please enter a valid 10-digit mobile number." }, { status: 400 });
  if (b.consent !== true) return NextResponse.json({ ok: false, error: "Please accept the terms and privacy policy." }, { status: 400 });
  if (isNaN(slotStart.getTime())) return NextResponse.json({ ok: false, error: "Please pick a time." }, { status: 400 });

  const { data: svc } = await db.from("pro_services").select("slug, title, duration_min, price_inr").eq("slug", slug).eq("active", true).maybeSingle();
  if (!svc) return NextResponse.json({ ok: false, error: "Unknown service." }, { status: 404 });

  // The chosen time must still be free, checked now and not trusted from the browser.
  const free = await computeSlots(db, svc.duration_min, istDate(slotStart), 2);
  if (!free.ok) return NextResponse.json({ ok: false, error: free.error ?? "Availability is unavailable." }, { status: 503 });
  const stillFree = Object.values(free.days).some((arr) => arr.includes(slotStart.toISOString()));
  if (!stillFree) return NextResponse.json({ ok: false, error: "That time was just taken. Please pick another." }, { status: 409 });

  // A few unpaid holds per person at most, so the calendar can't be blocked with free holds.
  const holdFrom = new Date(Date.now() - HOLD_MINUTES * 60000).toISOString();
  const { count } = await db.from("pro_bookings").select("id", { count: "exact", head: true }).eq("status", "pending_payment").gte("created_at", holdFrom).or(`email.eq.${email},phone.eq.${phone}`);
  if ((count ?? 0) >= 2) return NextResponse.json({ ok: false, error: "You already have a time on hold. Finish that payment or wait a few minutes." }, { status: 429 });

  const slotEnd = new Date(slotStart.getTime() + svc.duration_min * 60000);
  const { data: row, error } = await db
    .from("pro_bookings")
    .insert({
      service_slug: svc.slug, name, email, phone,
      target_role: str("targetRole", 200) || null,
      notes: str("notes", 1000) || null,
      slot_start: slotStart.toISOString(), slot_end: slotEnd.toISOString(),
      amount_inr: svc.price_inr, status: "pending_payment",
      source: str("src", 60) || null,
    })
    .select("id")
    .single();
  if (error || !row) return NextResponse.json({ ok: false, error: "Couldn't hold that time. Please try again." }, { status: 500 });

  const order = await createOrder(svc.price_inr, row.id.slice(0, 40), { booking_id: row.id, service: svc.slug });
  if (!order) {
    await db.from("pro_bookings").update({ status: "failed" }).eq("id", row.id);
    return NextResponse.json({ ok: false, error: "Couldn't start the payment. Please try again." }, { status: 502 });
  }
  await db.from("pro_bookings").update({ razorpay_order_id: order.id }).eq("id", row.id);
  return NextResponse.json({ ok: true, bookingId: row.id, orderId: order.id, amountPaise: svc.price_inr * 100, keyId: process.env.RAZORPAY_KEY_ID, title: svc.title });
}
