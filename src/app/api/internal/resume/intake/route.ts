import { NextRequest, NextResponse } from "next/server";
import { PRO_CC, PRO_FROM, adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { FIRST_DRAFT_DAYS, TIERS, addWorkingDays, dateIn, type TierKey } from "@/lib/resume-orders/core";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";

export const dynamic = "force-dynamic";

// The customer's answers (and the path of the CV the jobs site uploaded). Starts the delivery clock.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; answers?: Record<string, unknown>; cvPath?: string | null };
  if (!b.token) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: o } = await db.from("resume_orders").select("id, tier, name, email, status, intake_at").eq("intake_token", b.token).maybeSingle();
  if (!o || o.status === "pending_payment" || o.status === "failed") return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });

  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.answers ?? {})) if (typeof v === "string") clean[k.slice(0, 40)] = v.trim().slice(0, 4000);
  const now = new Date();
  const due = addWorkingDays(now, FIRST_DRAFT_DAYS);
  const first = !o.intake_at;
  await db
    .from("resume_orders")
    .update({
      intake: clean,
      cv_path: b.cvPath ?? undefined,
      intake_at: now.toISOString(),
      ...(first ? { draft_due_at: due.toISOString(), status: o.status === "paid" ? "details_received" : o.status } : {}),
    })
    .eq("id", o.id);

  const t = TIERS[o.tier as TierKey];
  try {
    const dueText = dateIn(first ? due : new Date());
    const toCustomer = [
      `Hi ${o.name.split(/\s+/)[0]},`,
      first ? "Thank you, we have your details." : "Thank you, we have received your updated details.",
      first ? `Your first draft will reach you by ${dueText}.` : "",
      "If you think of anything to add, just reply to this email.",
      "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088",
    ].filter(Boolean).join("\n\n");
    await sendEmail({ to: o.email, cc: PRO_CC, subject: `We have your details | ${t.label}`, text: toCustomer, html: invoiceEmailHtml(toCustomer), fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM });
  } catch (e) {
    console.error("resume intake email failed", e);
  }
  return NextResponse.json({ ok: true, due: due.toISOString() });
}
