import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";

// Replaces the old "admin manually types a password into a form and hands it
// off" vendor onboarding (team/create-user-form.tsx) with a real invite: an
// admin creates the agency-level record here, we email a self-serve signup
// link, and the vendor sets their own password on /vendor-signup/[token]
// (see that route + page). This is the piece that has to exist before
// "accumulate vendors" can actually scale past a handful of manual signups.
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days -- long enough for a
// vendor to get around to it without chasing them, short enough that a
// stale, unused invite link doesn't sit valid indefinitely.

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can invite vendor agencies" }, { status: 403 });
  }

  const { name, contactName, contactEmail } = await req.json();
  if (!name || !contactEmail) {
    return NextResponse.json({ error: "name and contactEmail are required" }, { status: 400 });
  }

  const inviteToken = crypto.randomBytes(24).toString("hex");
  const inviteTokenExpiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  const { data: agency, error } = await supabase
    .from("vendor_agencies")
    .insert({
      name,
      contact_name: contactName ?? null,
      contact_email: contactEmail,
      status: "invited",
      invite_token: inviteToken,
      invite_token_expires_at: inviteTokenExpiresAt,
      invited_by: user.id,
    })
    .select("id")
    .single();

  if (error || !agency) {
    return NextResponse.json({ error: error?.message ?? "Failed to create vendor agency" }, { status: 500 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const signupUrl = `https://clients.staffanchor.com/vendor-signup/${inviteToken}`;

  if (!gmailUser || !gmailPass) {
    // Agency row is still created -- the admin can copy the signup link
    // straight off the Vendors page and send it manually if email isn't
    // configured, rather than losing the invite entirely.
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: false });
  }

  try {
    await sendEmail({
      to: contactEmail,
      subject: `You're invited to join the StaffAnchor vendor network`,
      text: `Hi${contactName ? ` ${contactName}` : ""},\n\n${name} has been invited to submit candidates through StaffAnchor's vendor portal.\n\nSet up your account here: ${signupUrl}\n\nThis link expires in 14 days.\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: `Set up your StaffAnchor vendor account for ${name}.`,
        bodyHtml: `<p>Hi${contactName ? ` ${contactName}` : ""},</p><p><strong>${name}</strong> has been invited to submit candidates through StaffAnchor's vendor portal.</p><p><a href="${signupUrl}">Set up your account here</a> — this link expires in 14 days.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
      }),
    });
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: true });
  } catch (err) {
    console.error("Vendor invite email send failed", err);
    // The agency + token already exist -- surface the link so the admin can
    // still hand it off manually instead of the whole invite silently failing.
    return NextResponse.json({ ok: true, agencyId: agency.id, signupUrl, emailSent: false });
  }
}
