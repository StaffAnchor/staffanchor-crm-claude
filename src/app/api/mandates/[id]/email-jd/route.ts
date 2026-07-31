import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
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
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { candidateIds, resourceIds } = await req.json();
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    return NextResponse.json({ error: "candidateIds is required" }, { status: 400 });
  }

  const { data: mandate, error: mandateError } = await supabase
    .from("mandates")
    .select(
      "client_id, role_title, client_name, show_client_name, public_client_label, category, sub_domain, sub_domains, city, cities, budget_min, budget_max, experience_min, experience_max, work_mode, jd_overview, jd_responsibilities, jd_candidate_profile, jd_compensation_benefits, must_haves, good_to_haves"
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

  // Client-level resource library (website, YouTube, profile PDF/Word, etc.)
  // -- shared across every mandate for this client, unlike the JD which is
  // mandate-specific. Recruiter picks a subset in the UI; only those chosen
  // rows are fetched and attached/linked here. Never surfaced on the public
  // job listing -- this is candidate-email-only.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const admin = serviceKey ? createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey) : null;

  type Resource = { id: string; kind: "link" | "file"; name: string; url: string | null; storage_path: string | null };
  let resources: Resource[] = [];
  if (Array.isArray(resourceIds) && resourceIds.length > 0 && mandate.client_id) {
    const { data: resourceRows } = await supabase
      .from("client_resources")
      .select("id, kind, name, url, storage_path")
      .eq("client_id", mandate.client_id)
      .in("id", resourceIds);
    resources = (resourceRows ?? []) as Resource[];
  }

  const linkResources = resources.filter((r) => r.kind === "link" && r.url);
  const linksTextBlock =
    linkResources.length > 0
      ? `\n\nYou might also find these useful:\n${linkResources.map((r) => `- ${r.name}: ${r.url}`).join("\n")}`
      : "";
  const linksHtmlBlock =
    linkResources.length > 0
      ? `<p>You might also find these useful:</p><ul>${linkResources
          .map((r) => `<li><a href="${r.url}">${r.name}</a></li>`)
          .join("")}</ul>`
      : "";

  // File resources -- best-effort download from the client-resources bucket;
  // a missing/unreadable file never blocks the send, it's just skipped.
  const extraAttachments: { filename: string; content: Buffer }[] = [];
  if (admin) {
    for (const r of resources.filter((r) => r.kind === "file" && r.storage_path)) {
      try {
        const { data: fileData, error: downloadError } = await admin.storage
          .from("client-resources")
          .download(r.storage_path!);
        if (downloadError || !fileData) continue;
        const buffer = Buffer.from(await fileData.arrayBuffer());
        const ext = r.storage_path!.includes(".") ? r.storage_path!.slice(r.storage_path!.lastIndexOf(".")) : "";
        extraAttachments.push({ filename: `${r.name}${ext}`, content: buffer });
      } catch {
        // skip
      }
    }
  }

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
        text: `Hi ${candidate.full_name},\n\nPlease find attached the job description for ${mandate.role_title} at ${clientDisplay}.${linksTextBlock}\n\nThanks,\nStaffAnchor Team`,
        html: `<p>Hi ${candidate.full_name},</p><p>Please find attached the job description for <strong>${mandate.role_title}</strong> at <strong>${clientDisplay}</strong>.</p>${linksHtmlBlock}<p>Thanks,<br/>StaffAnchor Team</p>`,
        attachments: [
          { filename: `${fileNameSafe}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
          ...extraAttachments,
        ],
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
      detail: { sent_to: sent, failed, resources_included: resources.map((r) => r.name) },
    });
  }

  return NextResponse.json({ sent, failed });
}
