import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";
import { renderJdPdf, clientDisplayName, type JdPdfMandate } from "@/lib/generate-jd-pdf";

// Emails the same JD PDF (see /api/mandates/[id]/jd-pdf) directly to one or
// more candidates who are already in our database -- for candidates NOT in
// our database yet, the recruiter instead downloads the PDF from the
// mandate page and shares it manually (WhatsApp, personal email, etc.).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { candidateIds } = await req.json();
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds is required" }, { status: 400 });
  }

  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select(
      "role_title, client_name, show_client_name, public_client_label, category, sub_domain, sub_domains, city, cities, budget_min, budget_max, experience_min, experience_max, work_mode, jd_overview, jd_responsibilities, jd_candidate_profile, jd_compensation_benefits, must_haves, good_to_haves"
    )
    .eq("id", id)
    .single();
  if (mandateError || !mandate) {
    return NextResponse.json({ error: "Mandate not found" }, { status: 404 });
  }

  const { data: candidates } = await supabase
    .from("candidates")
    .select("id, full_name, email")
    .in("id", candidateIds);
  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ error: "No matching candidates found" }, { status: 404 });
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    return NextResponse.json(
      { error: "Email sending is not configured yet (missing GMAIL_USER / GMAIL_APP_PASSWORD on the server)." },
      { status: 503 }
    );
  }

  const clientDisplay = clientDisplayName(mandate);
  const pdfBuffer = await renderJdPdf(mandate as JdPdfMandate);
  const fileNameSafe = `JD-${mandate.role_title}-${clientDisplay}`
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const sent: string[] = [];
  const failed: { name: string; reason: string }[] = [];

  for (const candidate of candidates) {
    if (!candidate.email) {
      failed.push({ name: candidate.full_name, reason: "No email on file" });
      continue;
    }
    try {
      await transporter.sendMail({
        from: `"StaffAnchor" <${gmailUser}>`,
        to: candidate.email,
        subject: `Job Description: ${mandate.role_title} — ${clientDisplay}`,
        text: `Hi ${candidate.full_name},\n\nPlease find attached the job description for ${mandate.role_title} at ${clientDisplay}.\n\nThanks,\nStaffAnchor Team`,
        html: `<p>Hi ${candidate.full_name},</p><p>Please find attached the job description for <strong>${mandate.role_title}</strong> at <strong>${clientDisplay}</strong>.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
        attachments: [{ filename: `${fileNameSafe}.pdf`, content: pdfBuffer, contentType: "application/pdf" }],
      });
      sent.push(candidate.full_name);
    } catch (err) {
      console.error("JD email send failed", candidate.id, err);
      failed.push({ name: candidate.full_name, reason: "Send failed" });
    }
  }

  if (sent.length > 0) {
    await supabase.from("audit_log").insert({
      actor: user.id,
      action: "jd_pdf_emailed",
      entity: "mandate",
      entity_id: id,
      detail: { sent_to: sent, failed },
    });
  }

  return NextResponse.json({ sent, failed });
}
