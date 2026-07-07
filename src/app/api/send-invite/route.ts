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
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { candidateId } = await req.json();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("id, full_name, email, status")
    .eq("id", candidateId)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }
  if (!candidate.email) {
    return NextResponse.json({ error: "This candidate has no email on file." }, { status: 400 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "Email sending is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD on the server)." },
      { status: 503 }
    );
  }

  const registerUrl = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(
    candidate.full_name
  )}&email=${encodeURIComponent(candidate.email)}&ref=${candidate.id}`;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: candidate.email,
      subject: "Complete your StaffAnchor candidate profile",
      text: `Hi ${candidate.full_name},\n\nA StaffAnchor recruiter has started a profile for you. Please complete it here so we can match you to the right roles:\n\n${registerUrl}\n\nThanks,\nStaffAnchor Team`,
      html: `<p>Hi ${candidate.full_name},</p><p>A StaffAnchor recruiter has started a profile for you. Please complete it so we can match you to the right roles:</p><p><a href="${registerUrl}">${registerUrl}</a></p><p>Thanks,<br/>StaffAnchor Team</p>`,
    });

    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "completion_invite_sent",
      entity: "candidate",
      entity_id: candidateId,
      detail: { to: candidate.email },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Invite email send failed", err);
    return NextResponse.json({ error: "Failed to send the invite email. Please try again." }, { status: 500 });
  }
}
