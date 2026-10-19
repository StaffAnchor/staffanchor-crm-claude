import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/mail";
import { invoiceFileName } from "@/lib/invoice-generation";
import { INVOICE_CC, INVOICE_FROM, defaultInvoiceEmail, defaultReminderEmail, invoiceEmailHtml, parseEmailList } from "@/lib/invoice-email";

// Emails an already-generated Proforma / Tax Invoice PDF to the client.
// GET returns the draft (To from the client's billing email or primary
// contact, CC fixed to the owner, editable subject/body); POST sends it. Nothing
// is sent until POST, and the tranche records when and to whom it went.

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase };
}

type Joined = {
  proforma_invoice_number: string | null;
  final_invoice_number: string | null;
  proforma_file_path: string | null;
  final_invoice_file_path: string | null;
  proforma_emailed_at: string | null;
  proforma_emailed_to: string | null;
  final_emailed_at: string | null;
  final_emailed_to: string | null;
  amount_lakhs: number | string | null;
  proforma_sent_at: string | null;
  proforma_reminder_count: number;
  proforma_last_reminder_at: string | null;
  mandates: { role_title: string; client_name: string; client_id: string | null } | null;
  candidate_mandate_links: { candidates: { full_name: string } | null } | null;
};

async function load(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase
    .from("placement_fee_tranches")
    .select(
      "proforma_invoice_number, final_invoice_number, proforma_file_path, final_invoice_file_path, proforma_emailed_at, proforma_emailed_to, final_emailed_at, final_emailed_to, amount_lakhs, proforma_sent_at, proforma_reminder_count, proforma_last_reminder_at, mandates(role_title, client_name, client_id), candidate_mandate_links(candidates(full_name))"
    )
    .eq("id", id)
    .single();
  return data as unknown as Joined | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;
  const reminder = req.nextUrl.searchParams.get("reminder") === "1";
  const kind: "proforma" | "final" = reminder ? "proforma" : req.nextUrl.searchParams.get("kind") === "final" ? "final" : "proforma";

  const t = await load(supabase, id);
  if (!t) return NextResponse.json({ ok: false, error: "Tranche not found" }, { status: 404 });
  const number = kind === "proforma" ? t.proforma_invoice_number : t.final_invoice_number;
  const filePath = kind === "proforma" ? t.proforma_file_path : t.final_invoice_file_path;
  if (!number || !filePath) return NextResponse.json({ ok: false, error: "Generate the invoice first." }, { status: 400 });

  const clientId = t.mandates?.client_id ?? null;
  let contacts: { name: string | null; email: string }[] = [];
  let billingEmail: string | null = null;
  if (clientId) {
    const [{ data: regs }, { data: cs }] = await Promise.all([
      supabase.from("client_gst_registrations").select("billing_email, is_default").eq("client_id", clientId),
      supabase.from("client_contacts").select("full_name, email, is_primary").eq("client_id", clientId),
    ]);
    const reg = (regs ?? []).find((r) => r.is_default && r.billing_email) ?? (regs ?? []).find((r) => r.billing_email);
    billingEmail = reg?.billing_email ?? null;
    contacts = (cs ?? [])
      .filter((c) => c.email)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
      .map((c) => ({ name: c.full_name, email: c.email as string }));
  }

  // A reminder goes to whoever the proforma was emailed to; otherwise the
  // billing email, then the primary contact, then any contact with an email.
  const to = (reminder && t.proforma_emailed_to) || (billingEmail ?? contacts[0]?.email ?? "");
  const contactName = contacts.find((c) => c.email.toLowerCase() === to.toLowerCase())?.name ?? null;
  const totalInr = Math.round(Number(t.amount_lakhs ?? 0) * 1.18);
  const draft = reminder
    ? defaultReminderEmail({
        number,
        raisedOn: t.proforma_sent_at
          ? new Date(t.proforma_sent_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })
          : "",
        contactName,
        clientName: t.mandates?.client_name ?? "",
        candidateName: t.candidate_mandate_links?.candidates?.full_name ?? "the candidate",
        totalInr,
      })
    : defaultInvoiceEmail({
    kind,
    number,
    contactName,
    clientName: t.mandates?.client_name ?? "",
    candidateName: t.candidate_mandate_links?.candidates?.full_name ?? "the candidate",
    designation: t.mandates?.role_title ?? "",
    totalInr,
  });
  const fileName = invoiceFileName(kind, number, t.mandates?.client_name ?? null, t.candidate_mandate_links?.candidates?.full_name ?? null);

  return NextResponse.json({
    ok: true,
    from: INVOICE_FROM,
    cc: INVOICE_CC,
    to,
    toSource: billingEmail ? "billing email on the client's GST details" : to ? "client contact" : null,
    contacts,
    subject: draft.subject,
    body: draft.body,
    fileName,
    number,
    emailedAt: reminder ? t.proforma_last_reminder_at : kind === "proforma" ? t.proforma_emailed_at : t.final_emailed_at,
    emailedTo: kind === "proforma" ? t.proforma_emailed_to : t.final_emailed_to,
    reminderCount: t.proforma_reminder_count,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const reminder = body.reminder === true;
  const kind: "proforma" | "final" = reminder ? "proforma" : body.kind === "final" ? "final" : "proforma";
  const subject = String(body.subject ?? "").trim();
  const text = String(body.body ?? "").trim();
  const test = body.test === true;
  const to = parseEmailList(String(body.to ?? ""));
  const cc = parseEmailList(String(body.cc ?? INVOICE_CC));
  if (!subject || !text) return NextResponse.json({ ok: false, error: "Subject and message can't be empty." }, { status: 400 });
  if (to.bad.length || cc.bad.length) {
    return NextResponse.json({ ok: false, error: `Not a valid email address: ${[...to.bad, ...cc.bad].join(", ")}` }, { status: 400 });
  }
  if (!test && to.ok.length === 0) return NextResponse.json({ ok: false, error: "Add at least one To address." }, { status: 400 });
  if (test && cc.ok.length === 0) return NextResponse.json({ ok: false, error: "No CC address to send the test to." }, { status: 400 });

  const t = await load(supabase, id);
  if (!t) return NextResponse.json({ ok: false, error: "Tranche not found" }, { status: 404 });
  const number = kind === "proforma" ? t.proforma_invoice_number : t.final_invoice_number;
  const filePath = kind === "proforma" ? t.proforma_file_path : t.final_invoice_file_path;
  if (!number || !filePath) return NextResponse.json({ ok: false, error: "Generate the invoice first." }, { status: 400 });

  const { data: file, error: dlError } = await supabase.storage.from("invoices").download(filePath);
  if (dlError || !file) return NextResponse.json({ ok: false, error: "Couldn't read the invoice PDF." }, { status: 500 });
  const pdf = Buffer.from(await file.arrayBuffer());
  const fileName = invoiceFileName(kind, number, t.mandates?.client_name ?? null, t.candidate_mandate_links?.candidates?.full_name ?? null);

  const recipients = test ? cc.ok : to.ok;
  const ccList = test ? [] : cc.ok;
  const finalSubject = test ? `[TEST] ${subject}` : subject;
  const finalText = test ? `${text}\n\n--\nTEST: this copy went only to you. A real send would go to ${to.ok.join(", ") || "(no To address yet)"}.` : text;

  try {
    const sent = await sendEmail({
      to: recipients.join(", "),
      cc: ccList.length ? ccList : undefined,
      subject: finalSubject,
      text: finalText,
      html: invoiceEmailHtml(finalText),
      fromName: "StaffAnchor",
      fromEmail: INVOICE_FROM,
      replyTo: INVOICE_FROM,
      attachments: [{ filename: fileName, content: pdf, contentType: "application/pdf" }],
    });
    if (!test && reminder) {
      await supabase
        .from("placement_fee_tranches")
        .update({ proforma_reminder_count: (t.proforma_reminder_count ?? 0) + 1, proforma_last_reminder_at: new Date().toISOString() })
        .eq("id", id);
    } else if (!test) {
      const stamp =
        kind === "proforma"
          ? { proforma_emailed_at: new Date().toISOString(), proforma_emailed_to: to.ok.join(", ") }
          : { final_emailed_at: new Date().toISOString(), final_emailed_to: to.ok.join(", ") };
      await supabase.from("placement_fee_tranches").update(stamp).eq("id", id);
    }
    return NextResponse.json({ ok: true, test, sentVia: sent.sentVia, from: INVOICE_FROM, to: recipients, cc: ccList });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
