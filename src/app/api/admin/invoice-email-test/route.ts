import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/mail";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { INVOICE_CC, INVOICE_FROM, invoiceEmailHtml } from "@/lib/invoice-email";

// Sends a clearly-marked SAMPLE invoice email to the CC address only, so the
// owner can see which sender address the mail actually arrives from. Nothing
// is saved and no invoice number is used.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Not signed in" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });

  const pdf = await renderInvoicePdf({
    kind: "proforma",
    invoiceNumber: "SAMPLE",
    invoiceDate: new Date(),
    client: { name: "Sample Client Pvt Ltd", gstin: "29AAAAA0000A1Z5", billingAddress: "Sample address, Bengaluru", stateCode: "29", stateName: "Karnataka" },
    item: { candidateName: "Sample Candidate", designation: "Sales Manager", location: "Bengaluru", dateOfJoining: null, billingAmount: 100000, commissionPct: 8.33, annualCtc: 1200000 },
  });

  const text = [
    "Hi,",
    "This is a sample of how invoice emails will arrive. It has a sample Proforma Invoice attached. No real invoice or number was used.",
    `Intended sender: ${INVOICE_FROM}\nCC on real invoices: ${INVOICE_CC}`,
    "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 9818881142",
  ].join("\n\n");

  try {
    const sent = await sendEmail({
      to: INVOICE_CC,
      subject: "[SAMPLE] Proforma Invoice | Sample Client | Sample Candidate",
      text,
      html: invoiceEmailHtml(text),
      fromName: "StaffAnchor",
      fromEmail: INVOICE_FROM,
      replyTo: INVOICE_FROM,
      attachments: [{ filename: "Proforma Invoice SAMPLE.pdf", content: pdf, contentType: "application/pdf" }],
    });
    return NextResponse.json({ ok: true, to: INVOICE_CC, intendedFrom: INVOICE_FROM, sentVia: sent.sentVia });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Send failed" }, { status: 500 });
  }
}
