import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendEmail, renderEmailShell } from "@/lib/mail";

export const runtime = "nodejs";

// Fired by a Postgres trigger (notify_new_employer_inquiry) the moment a
// genuine employer inquiry is filed -- from the Contact form, the Employers
// page or a client brief link, since all of them end up in employer_inquiries.
// Spam, tests and jobseeker queries are filed under a different `kind` and
// never reach this route. Authenticates with the shared secret held in
// internal_secrets (same handshake as /api/internal/score-link), and the
// alert_sent_at claim below means a retry can never email twice.
const ALERT_TO = process.env.INQUIRY_ALERT_TO || "gagan@staffanchor.com";
const INBOX_URL = "https://clients.staffanchor.com/client-acquisition/employer-inquiries";

const esc = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-internal-secret");
  const { id } = await req.json();
  if (!secret || !id) return NextResponse.json({ error: "Missing secret or id" }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ ok: false, skipped: "not configured" });
  const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: secretRow } = await admin.from("internal_secrets").select("value").eq("key", "inquiry_alert_secret").maybeSingle();
  if (!secretRow?.value || secret !== secretRow.value) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Claim the alert first: only one caller can flip alert_sent_at from null.
  const { data: row } = await admin
    .from("employer_inquiries")
    .update({ alert_sent_at: new Date().toISOString() })
    .eq("id", id)
    .eq("kind", "employer")
    .is("alert_sent_at", null)
    .select("*")
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: true, skipped: "already sent or not an employer inquiry" });

  const who = row.company_name || row.full_name;
  const lines: [string, unknown][] = [
    ["Company", row.company_name],
    ["Contact", [row.full_name, row.designation].filter(Boolean).join(", ")],
    ["Email", row.work_email],
    ["Phone", row.mobile_number],
    ["Role", row.role_title],
    ["City", row.city],
    ["Message", row.message],
  ];
  const rowsHtml = lines
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#94a3b8;vertical-align:top;white-space:nowrap;">${k}</td><td style="padding:4px 0;color:#0f172a;white-space:pre-wrap;">${esc(v)}</td></tr>`
    )
    .join("");
  const text = lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\nOpen in CRM: ${INBOX_URL}`;

  try {
    await sendEmail({
      to: ALERT_TO,
      subject: `New employer inquiry: ${who}${row.role_title ? ` (${row.role_title})` : ""}`,
      text,
      html: renderEmailShell({
        preheader: `${who} just reached out.`,
        bodyHtml: `<p style="margin:0 0 12px;">A new employer inquiry just came in.</p><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;">${rowsHtml}</table><p style="margin:16px 0 0;"><a href="${INBOX_URL}" style="color:#2563eb;">Open in the CRM</a></p>`,
      }),
    });
  } catch (err) {
    console.error("Inquiry alert email failed", id, err);
    // Release the claim so a retry can send it.
    await admin.from("employer_inquiries").update({ alert_sent_at: null }).eq("id", id);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
