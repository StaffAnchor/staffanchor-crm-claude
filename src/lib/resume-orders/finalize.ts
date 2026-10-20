import type { SupabaseClient } from "@supabase/supabase-js";
import { PRO_CC, PRO_FROM } from "@/lib/pro-sessions/core";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";
import { FIRST_DRAFT_DAYS, TIERS, type TierKey } from "./core";

export const INTAKE_BASE = "https://jobs.staffanchor.com/resume/intake";

type Order = { id: string; tier: TierKey; name: string; email: string; amount_inr: number; status: string; intake_token: string };

// Payment verified: mark the order paid and send the intake link. Safe to call twice (the email goes out once).
export async function finalizeResumeOrder(db: SupabaseClient, razorpayOrderId: string, paymentId: string): Promise<{ ok: boolean; token?: string; error?: string }> {
  const { data } = await db.from("resume_orders").select("id, tier, name, email, amount_inr, status, intake_token").eq("razorpay_order_id", razorpayOrderId).maybeSingle();
  if (!data) return { ok: false, error: "Order doesn't match the payment." };
  const o = data as Order;
  if (o.status !== "pending_payment") return { ok: true, token: o.intake_token }; // already handled
  const { error } = await db.from("resume_orders").update({ status: "paid", razorpay_payment_id: paymentId, paid_at: new Date().toISOString() }).eq("id", o.id).eq("status", "pending_payment");
  if (error) return { ok: false, error: "Couldn't confirm the order." };

  try {
    const t = TIERS[o.tier];
    const link = `${INTAKE_BASE}/${o.intake_token}`;
    const text = [
      `Hi ${o.name.split(/\s+/)[0]},`,
      `Thank you. Your order is confirmed: ${t.label} (${t.band}), ₹${o.amount_inr.toLocaleString("en-IN")}.`,
      `Next step: tell us about your career so far. It takes about 15 minutes, and you can attach your current resume.\n${link}`,
      `Your first draft is delivered ${FIRST_DRAFT_DAYS} working days after we receive this form (working days are Monday to Saturday). The final resume follows in ${t.finalDelivery}, with ${t.revisions} revision round${t.revisions > 1 ? "s" : ""} included, as Word and PDF.`,
      "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 9818881142",
    ].join("\n\n");
    await sendEmail({ to: o.email, cc: PRO_CC, subject: `Order confirmed: ${t.label} | next step`, text, html: invoiceEmailHtml(text), fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM });
  } catch (e) {
    console.error("resume order confirmation email failed", e);
  }
  return { ok: true, token: o.intake_token };
}
