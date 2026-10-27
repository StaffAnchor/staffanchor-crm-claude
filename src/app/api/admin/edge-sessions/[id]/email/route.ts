import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { EMAIL_RE, PRO_CC, PRO_FROM, adminDb } from "@/lib/pro-sessions/core";
import { cleanData, COLUMNS, type ReportRow } from "@/lib/session-report/store";
import { renderSessionReport, reportFileName } from "@/lib/session-report/pdf";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Emails the report to the candidate, from info@ with a copy to the owner. It only ever runs when the facilitator presses
// "Send" in the workspace, to the address shown there.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { to?: string; message?: string };
  const to = (b.to ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const { data } = await db.from("session_reports").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const r = data as ReportRow;
  const pdf = await renderSessionReport({ name: r.candidate_name, track: r.track, level: r.level, data: cleanData(r.data) });
  const first = r.candidate_name.trim().split(/\s+/)[0] || "there";
  const note = (b.message ?? "").trim().slice(0, 1500) || "Thank you for your time today. Your plan from our session is attached. Please reply to this email if you have any questions.";
  const text = [`Hi ${first},`, note, "Regards,\nGagan Sharma\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088"].join("\n\n");
  try {
    await sendEmail({
      to, cc: PRO_CC, subject: `Your job search plan | StaffAnchor`, text, html: invoiceEmailHtml(text),
      attachments: [{ filename: reportFileName(r.candidate_name), content: pdf, contentType: "application/pdf" }],
      fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM,
    });
  } catch (e) {
    console.error("session report email failed", e);
    return NextResponse.json({ error: "Couldn't send the email. Nothing was sent." }, { status: 500 });
  }
  await db.from("session_reports").update({ sent_at: new Date().toISOString(), sent_to: to }).eq("id", id);
  return NextResponse.json({ ok: true, sentTo: to });
}
