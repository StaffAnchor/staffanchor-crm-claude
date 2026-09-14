import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Approving a vendor_applications row is what actually creates the real
// vendor_agencies relationship -- deliberately reusing the exact same
// "invited" status + invite_token + set-password email flow that
// api/vendor-agencies/invite/route.ts already uses for agency invites,
// rather than building a second, parallel activation mechanism. The
// application itself (LinkedIn, experience, tool access, resume, etc.)
// stays in vendor_applications, linked via vendor_agency_id, since
// vendor_agencies/profiles have no columns for any of that.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can approve vendor applications" }, { status: 403 });
  }

  const { data: application } = await supabase
    .from("vendor_applications")
    .select("id, full_name, email, status")
    .eq("id", id)
    .single();
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.status !== "applied") {
    return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: agency, error: agencyError } = await supabase
    .from("vendor_agencies")
    .insert({
      name: application.full_name,
      contact_name: application.full_name,
      contact_email: application.email,
      status: "invited",
      invite_token: inviteToken,
      invite_token_expires_at: inviteTokenExpiresAt,
      invited_by: user.id,
      notes: "Self-applied via vendors.staffanchor.com",
    })
    .select("id")
    .single();
  if (agencyError || !agency) {
    return NextResponse.json({ error: agencyError?.message ?? "Failed to create vendor agency" }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("vendor_applications")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: new Date().toISOString(), vendor_agency_id: agency.id })
    .eq("id", id);
  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const signupUrl = `https://clients.staffanchor.com/vendor-signup/${inviteToken}`;

  if (!gmailUser || !gmailPass) {
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: false });
  }

  try {
    await sendEmail({
      to: application.email,
      subject: `You're approved -- set up your StaffAnchor vendor account`,
      text: `Hi ${application.full_name},\n\nYour application to the StaffAnchor vendor network has been approved.\n\nSet up your account here: ${signupUrl}\n\nThis link expires in 14 days.\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: `Set up your StaffAnchor vendor account.`,
        bodyHtml: `<p>Hi ${application.full_name},</p><p>Your application to the StaffAnchor vendor network has been approved.</p><p><a href="${signupUrl}">Set up your account here</a> — this link expires in 14 days.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
      }),
    });
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: true });
  } catch (err) {
    console.error("Vendor application approval email send failed", err);
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: false });
  }
}
