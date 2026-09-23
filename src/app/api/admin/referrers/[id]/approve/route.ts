import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Approving a sales_circle_referrers application mints an invite token +
// sends a set-password email -- the exact same mechanism
// api/admin/vendor-applications/[id]/approve/route.ts uses, just against
// referrer_signup instead of vendor-signup. Unlike the vendor flow there's
// no separate "application" vs "agency" entity here -- one referrer row
// covers the whole applied -> approved -> active lifecycle -- so this just
// updates the row in place rather than inserting a second record.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { data: referrer } = await supabase
    .from("sales_circle_referrers")
    .select("id, full_name, email, status")
    .eq("id", id)
    .single();
  if (!referrer) return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
  if (referrer.status !== "applied") {
    return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { error: updateError } = await supabase
    .from("sales_circle_referrers")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      invite_token: inviteToken,
      invite_token_expires_at: inviteTokenExpiresAt,
    })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const signupUrl = `https://clients.staffanchor.com/referrer-signup/${inviteToken}`;

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ ok: true, signupUrl, emailSent: false });
  }

  try {
    await sendEmail({
      to: referrer.email,
      subject: `You're in -- set up your StaffAnchor Sales Circle account`,
      text: `Hi ${referrer.full_name},\n\nYour application to StaffAnchor Sales Circle has been approved.\n\nSet up your account here: ${signupUrl}\n\nThis link expires in 14 days.\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: `Set up your Sales Circle account.`,
        bodyHtml: `<p>Hi ${referrer.full_name},</p><p>Your application to StaffAnchor Sales Circle has been approved.</p><p><a href="${signupUrl}">Set up your account here</a> — this link expires in 14 days.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
      }),
    });
    return NextResponse.json({ ok: true, signupUrl, emailSent: true });
  } catch (err) {
    console.error("Referrer approval email send failed", err);
    return NextResponse.json({ ok: true, signupUrl, emailSent: false });
  }
}
