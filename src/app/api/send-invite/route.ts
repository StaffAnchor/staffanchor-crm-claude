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
    .select("id, full_name, email, status, segment_data")
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

  // If the recruiter explicitly flagged fields as "ask candidate later" on
  // the Create Candidate form (segment_data.missing_fields), reference them
  // by name here instead of a generic "complete your profile" ask -- same
  // label vocabulary as the Create Candidate form and the inbox-sweep cron's
  // incomplete_profile task so a candidate sees consistent wording wherever
  // this comes up.
  const missingFields = Array.isArray((candidate.segment_data as { missing_fields?: unknown } | null)?.missing_fields)
    ? ((candidate.segment_data as { missing_fields: unknown[] }).missing_fields.filter((f): f is string => typeof f === "string"))
    : [];
  const missingFieldLabels: Record<string, string> = {
    sub_domain: "your practice / vertical / function",
    current_employer: "your current employer",
    current_job_title: "your current job title",
    current_employment_status: "your employment status",
    current_industry: "your current industry",
    total_experience_years: "your total experience",
    current_fixed_ctc: "your current fixed CTC",
    expected_fixed_ctc: "your expected fixed CTC",
    notice_period: "your notice period / days to join",
    role_type: "whether you're an IC or leading a team",
    highest_qualification: "your highest qualification",
    work_mode: "your preferred work mode",
    open_to_relocation: "whether you're open to relocation",
    resume: "your resume",
  };
  const missingFieldText =
    missingFields.length > 0
      ? ` Specifically, we still need: ${missingFields.map((f) => missingFieldLabels[f] ?? f).join(", ")}.`
      : "";

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"StaffAnchor" <${gmailUser}>`,
      to: candidate.email,
      subject: "Complete your StaffAnchor candidate profile",
      text: `Hi ${candidate.full_name},\n\nA StaffAnchor recruiter has started a profile for you.${missingFieldText} Please complete it here so we can match you to the right roles:\n\n${registerUrl}\n\nThanks,\nStaffAnchor Team`,
      html: `<p>Hi ${candidate.full_name},</p><p>A StaffAnchor recruiter has started a profile for you.${missingFieldText}</p><p>Please complete it so we can match you to the right roles:</p><p><a href="${registerUrl}">${registerUrl}</a></p><p>Thanks,<br/>StaffAnchor Team</p>`,
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
