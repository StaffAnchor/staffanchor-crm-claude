import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { clientId, email } = await req.json();
  if (!clientId || !email) {
    return NextResponse.json({ error: "clientId and email are required" }, { status: 400 });
  }

  const { data: client, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientId)
    .single();

  if (error || !client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "Email sending is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD on the server)." },
      { status: 503 }
    );
  }

  const loginUrl = `https://jobs.staffanchor.com/client-login?email=${encodeURIComponent(email)}`;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: email,
      subject: `Your StaffAnchor client portal access is ready`,
      text: `Hi,\n\nYou've been given access to the StaffAnchor client portal for ${client.name}, where you can review candidate shortlists for your open roles and share feedback directly.\n\nSign in here (no password needed, just this email address): ${loginUrl}\n\nThanks,\nStaffAnchor Team`,
      html: `<p>Hi,</p><p>You've been given access to the StaffAnchor client portal for <strong>${client.name}</strong>, where you can review candidate shortlists for your open roles and share feedback directly.</p><p><a href="${loginUrl}">Sign in here</a> — no password needed, just this email address.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
    });

    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "client_invite_sent",
      entity: "client",
      entity_id: clientId,
      detail: { to: email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Client invite email send failed", err);
    return NextResponse.json({ error: "Failed to send the invite email. Please try again." }, { status: 500 });
  }
}
