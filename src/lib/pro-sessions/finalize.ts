import type { SupabaseClient } from "@supabase/supabase-js";
import { PRO_CC, PRO_FROM, formatIst, inr, type ProService } from "./core";
import { createMeetEvent, getAccessToken } from "./google";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";
import { ensureServiceInvoice } from "@/lib/service-invoices";
import { FIRST_DRAFT_DAYS, TIERS, isTier, newToken, type TierKey } from "@/lib/resume-orders/core";
import { INTAKE_BASE } from "@/lib/resume-orders/finalize";

type Booking = {
  id: string;
  service_slug: string;
  name: string;
  email: string;
  phone: string;
  target_role: string | null;
  slot_start: string;
  slot_end: string;
  amount_inr: number;
  status: string;
  calendar_event_id: string | null;
  meet_link: string | null;
  resume_tier: string | null;
  experience_years: number | null;
  source: string | null;
};

// What to do before the session, per service. Taken from the session descriptions.
const PREP: Record<string, string> = {
  "mock-interview": "Bring a specific role or job description if you have one, so the interview is built around it.",
  "job-search-strategy": "Please reply to this email with your resume at least 24 hours before the session, so the time is spent on strategy and not on reading.",
};

/**
 * Called once a payment is confirmed, from the browser callback or the webhook (whichever arrives first). Safe to
 * call twice: a booking already confirmed is returned as it is.
 */
export async function finalizeBooking(db: SupabaseClient, bookingId: string, paymentId: string): Promise<{ ok: boolean; booking?: Booking; intakeToken?: string | null; error?: string }> {
  const { data: b } = await db.from("pro_bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!b) return { ok: false, error: "Booking not found." };
  let booking = b as Booking;
  if (booking.status === "paid" && (booking.calendar_event_id || booking.meet_link)) return { ok: true, booking, intakeToken: await comboOrderToken(db, booking) };

  if (booking.status !== "paid") {
    await db.from("pro_bookings").update({ status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() }).eq("id", bookingId).eq("status", "pending_payment");
    booking = { ...booking, status: "paid" };
  }

  // The browser callback and the Razorpay webhook can arrive in the same second, and both used to create a calendar
  // event, so the customer got two invites with two Meet links. Only the first to claim the booking does the work
  // (event, invoice, confirmation); the other waits for it and returns the same result. A claim older than two
  // minutes counts as abandoned, so a retry after a real failure can still go ahead.
  const staleBefore = new Date(Date.now() - 2 * 60000).toISOString();
  const { data: claim } = await db.from("pro_bookings").update({ finalize_claimed_at: new Date().toISOString() }).eq("id", bookingId).is("calendar_event_id", null).or(`finalize_claimed_at.is.null,finalize_claimed_at.lt.${staleBefore}`).select("id");
  if (!claim || claim.length === 0) {
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const { data: again } = await db.from("pro_bookings").select("*").eq("id", bookingId).maybeSingle();
      if (again) booking = again as Booking;
      if (booking.calendar_event_id || booking.meet_link) break;
    }
    return { ok: true, booking, intakeToken: await comboOrderToken(db, booking) };
  }

  const { data: svc } = await db.from("pro_services").select("slug, title, duration_min, price_inr").eq("slug", booking.service_slug).maybeSingle();
  const service = (svc ?? { title: booking.service_slug, duration_min: 60, price_inr: booking.amount_inr }) as Pick<ProService, "title" | "duration_min" | "price_inr">;

  // Calendar event with a Google Meet link; Google emails the invite to the attendee.
  let meet: string | null = booking.meet_link;
  let calendarError: string | null = null;
  const token = await getAccessToken(db);
  if (!booking.calendar_event_id) {
    if (!token) {
      calendarError = "Google Calendar isn't connected; add this session to the calendar by hand.";
    } else {
      const ev = await createMeetEvent(token, {
        summary: `${service.title} | ${booking.name}`,
        description: `StaffAnchor Edge session booked online.\n\n${booking.name}\n${booking.email}\n${booking.phone}\nTarget role: ${booking.target_role ?? "—"}`,
        start: new Date(booking.slot_start),
        end: new Date(booking.slot_end),
        attendeeEmail: booking.email,
        requestId: booking.id,
      });
      if (ev) {
        meet = ev.meetLink;
        await db.from("pro_bookings").update({ calendar_event_id: ev.id, meet_link: ev.meetLink, calendar_error: null }).eq("id", bookingId);
        booking = { ...booking, calendar_event_id: ev.id, meet_link: ev.meetLink };
      } else {
        calendarError = "Google Calendar didn't accept the event; add this session by hand.";
      }
    }
    if (calendarError) await db.from("pro_bookings").update({ calendar_error: calendarError }).eq("id", bookingId);
  }

  // The strategy + resume combo also carries a Resume Writing order, which starts at the intake form.
  const intakeToken = await comboOrderToken(db, booking);

  // Tax invoice, made now and kept. It is emailed only when someone asks for it.
  try {
    await ensureServiceInvoice(db, "edge", bookingId);
  } catch (e) {
    console.error("session invoice failed", e);
  }

  // Confirmation email: From info@, copy to the owner. Claimed first, so it goes out once however many times this runs.
  const { data: mailClaim } = await db.from("pro_bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", bookingId).is("confirmation_sent_at", null).select("id");
  if (mailClaim && mailClaim.length > 0) try {
    const when = formatIst(new Date(booking.slot_start));
    const text = [
      `Hi ${booking.name.split(/\s+/)[0]},`,
      `Your session is confirmed.`,
      `${service.title}\n${when} IST, ${service.duration_min} minutes, video meeting\nPaid: ${inr(booking.amount_inr)}`,
      meet ? `Join here: ${meet}` : "Your joining link will follow by email shortly.",
      PREP[booking.service_slug] ?? "",
      intakeToken && isTier(booking.resume_tier)
        ? `Your resume: the Resume Writing part of this package (${TIERS[booking.resume_tier].label}) starts with a short form about your career, about 15 minutes, where you can attach your current resume.\n${INTAKE_BASE}/${intakeToken}\nYour first draft is delivered ${FIRST_DRAFT_DAYS} working days after we receive the form (Monday to Saturday), and the final resume follows in ${TIERS[booking.resume_tier].finalDelivery}, with ${TIERS[booking.resume_tier].revisions} revision round${TIERS[booking.resume_tier].revisions > 1 ? "s" : ""} included, as Word and PDF.`
        : "",
      "If you need to move the session, just reply to this email. Need a GST invoice? Reply and we will send it.",
      "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088",
    ].filter(Boolean).join("\n\n");
    await sendEmail({
      to: booking.email,
      cc: PRO_CC,
      subject: `Confirmed: ${service.title} | ${when} IST`,
      text,
      html: invoiceEmailHtml(text),
      fromName: "StaffAnchor",
      fromEmail: PRO_FROM,
      replyTo: PRO_FROM,
    });
  } catch (e) {
    console.error("pro session confirmation email failed", e);
    await db.from("pro_bookings").update({ confirmation_sent_at: null }).eq("id", bookingId); // let a retry send it
  }
  return { ok: true, booking: { ...booking, meet_link: meet }, intakeToken };
}

/**
 * For the combo, makes the paid Resume Writing order that belongs to this booking (once) and returns its intake
 * token. Its value is the resume share of the combo price; the single invoice sits on the booking.
 */
async function comboOrderToken(db: SupabaseClient, booking: Booking): Promise<string | null> {
  if (!isTier(booking.resume_tier)) return null;
  const { data: existing } = await db.from("resume_orders").select("intake_token").eq("booking_id", booking.id).maybeSingle();
  if (existing) return (existing as { intake_token: string }).intake_token;
  const tier: TierKey = booking.resume_tier;
  const resumeShare = Math.round(TIERS[tier].price * (booking.amount_inr / (999 + TIERS[tier].price)));
  const token = newToken();
  const { error } = await db.from("resume_orders").insert({
    tier, amount_inr: resumeShare, name: booking.name, email: booking.email, phone: booking.phone,
    status: "paid", paid_at: new Date().toISOString(), intake_token: token, booking_id: booking.id,
    experience_years: booking.experience_years, source: booking.source, notes: "Part of the Job Strategy + Resume Rebuild package; one invoice, on the booking.",
  });
  if (error) {
    // Lost a race with the other confirmation path: the order exists now.
    const { data: again } = await db.from("resume_orders").select("intake_token").eq("booking_id", booking.id).maybeSingle();
    return (again as { intake_token: string } | null)?.intake_token ?? null;
  }
  return token;
}
