import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { whatsappEmailLine } from "@/lib/whatsapp-entry";

export const runtime = "nodejs";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Emails a candidate the message a recruiter drafted (used when WhatsApp's 24-hour window is closed).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });

  const { candidateId, body } = (await req.json().catch(() => ({}))) as { candidateId?: string; body?: string };
  if (!candidateId || !body?.trim()) return NextResponse.json({ error: "A candidate and a message are required." }, { status: 400 });
  const { data: cand } = await supabase.from("candidates").select("id, full_name, email").eq("id", candidateId).maybeSingle();
  if (!cand) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  if (!cand.email || String(cand.email).endsWith(".invalid")) return NextResponse.json({ ok: false, error: "There's no email on file for this candidate." });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) return NextResponse.json({ ok: false, error: "Email sending isn't configured." });

  const registerUrl = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(cand.full_name ?? "")}&email=${encodeURIComponent(cand.email)}&ref=${cand.id}`;
  const text = body.trim();
  try {
    await sendEmail({
      to: cand.email,
      subject: "A few details to complete your StaffAnchor profile",
      text: `${text}\n\nYou can reply to this email, or fill it in here: ${registerUrl}\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: "A minute to complete your profile so we can match you to the right roles.",
        bodyHtml: `<p>${esc(text).replace(/\n/g, "<br/>")}</p><p>You can reply to this email, or <a href="${registerUrl}">fill it in here</a>.</p><p>Thanks,<br/>StaffAnchor Team</p>${whatsappEmailLine("Hi StaffAnchor, I got your email about completing my profile. Could you help?").html}`,
      }),
    });
    await supabase.from("audit_log").insert({ actor: user.id, action: "missing_details_message_emailed", entity: "candidate", entity_id: cand.id, detail: { to: cand.email } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Candidate email failed", err);
    return NextResponse.json({ ok: false, error: "Couldn't send the email. Please try again." });
  }
}
