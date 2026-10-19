import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf, invoicePrefix, fyShort } from "@/lib/invoice-pdf";
import { resolveTrancheInvoiceData, proformaReference, invoiceFileName, type InvoiceOverrides } from "@/lib/invoice-generation";

// Generates the system's own Proforma or Tax (final) Invoice PDF for a
// placement_fee_tranche and advances its lifecycle in one step -- "Mark
// proforma sent" now actually produces the proforma PDF rather than just
// flipping a status flag, per "You can start generating both from this
// system only and track it." Numbering is a gapless-per-kind counter per financial year
// (SAPI/26-27/002, SAINV/26-27/001; within GST's 16-character limit), allocated
// atomically in the database and stored on the tranche, so a document keeps
// its number however many times it is downloaded.
//
// `overrides` (candidate name, designation, location, DOJ, billing amount,
// registrationId) come from the preview/confirm modal -- see
// preview-invoice/route.ts, which renders the exact same document with the
// same resolver but mints nothing, so what the admin approved is what gets
// generated here.

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { supabase, userId: user.id };
}

// Allocated by an atomic counter in the database (next_invoice_number), so a
// number is never reused or handed out twice, even on a double click.
async function nextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "proforma" | "final",
  date: Date
): Promise<string | null> {
  const { data, error } = await supabase.rpc("next_invoice_number", { p_kind: kind, p_fy: fyShort(date) });
  if (error || typeof data !== "number") return null;
  return `${invoicePrefix(kind, date)}${String(data).padStart(3, "0")}`;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const kind: "proforma" | "final" = body.kind === "final" ? "final" : "proforma";
  const overrides: InvoiceOverrides = body.overrides ?? {};

  const resolved = await resolveTrancheInvoiceData(supabase, id, overrides);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const { client, registration, item } = resolved;

  const { data: existing } = await supabase
    .from("placement_fee_tranches")
    .select("status, payment_received_at, final_invoice_number, proforma_invoice_number")
    .eq("id", id)
    .single();
  if (kind === "final" && existing?.final_invoice_number) {
    return NextResponse.json({ ok: false, error: `A Tax Invoice (${existing.final_invoice_number}) already exists for this tranche.` }, { status: 409 });
  }

  // One number per document per placement, forever: a second request returns
  // the existing one instead of issuing a new number.
  if (kind === "proforma" && existing?.proforma_invoice_number) {
    return NextResponse.json({ ok: false, error: `Proforma ${existing.proforma_invoice_number} already exists for this tranche. Download it from Billing.` }, { status: 409 });
  }

  const invoiceDate = new Date();
  const invoiceNumber = await nextInvoiceNumber(supabase, kind, invoiceDate);
  if (!invoiceNumber) {
    return NextResponse.json({ ok: false, error: "Couldn't allocate an invoice number. Try again." }, { status: 500 });
  }
  const proformaRef = kind === "final" ? await proformaReference(supabase, id) : null;

  const pdfBuffer = await renderInvoicePdf({
    kind,
    invoiceNumber,
    invoiceDate,
    paid: kind === "final" && (!!existing?.payment_received_at || existing?.status === "proforma_sent"),
    proformaRef,
    client: {
      name: client.name,
      gstin: registration.gstin,
      billingAddress: registration.billing_address,
      stateCode: registration.state_code,
      stateName: registration.state_name,
    },
    item,
  });

  const safeNumber = invoiceNumber.replace(/\//g, "-");
  const storagePath = `${kind}-${safeNumber}-${Date.now()}.pdf`;
  const { error: uploadError } = await supabase.storage.from("invoices").upload(storagePath, pdfBuffer, {
    contentType: "application/pdf",
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Paid when payment was already logged or we're converting a proforma the client has now paid; a direct tax invoice stays unpaid (Credit) until marked paid.
  const paymentAlreadyRecorded = !!existing?.payment_received_at;
  const settlesNow = !paymentAlreadyRecorded && existing?.status === "proforma_sent";
  const patch: Record<string, string> =
    kind === "proforma"
      ? { status: "proforma_sent", proforma_sent_at: new Date().toISOString(), proforma_invoice_number: invoiceNumber, proforma_file_path: storagePath }
      : { status: "final_invoiced", ...(settlesNow ? { payment_received_at: new Date().toISOString() } : {}), final_invoiced_at: new Date().toISOString(), final_invoice_number: invoiceNumber, final_invoice_file_path: storagePath };

  // Billing-amount corrections made in the preview modal should stick on
  // the tranche itself too, not just this one document -- otherwise the
  // Billing table keeps showing the old (wrong) figure after the invoice
  // that corrected it.
  if (overrides.billingAmount != null) {
    patch.amount_lakhs = String(overrides.billingAmount);
  }

  const { error: updateError } = await supabase.from("placement_fee_tranches").update(patch).eq("id", id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(storagePath, 60 * 60, {
    download: invoiceFileName(kind, invoiceNumber, client.name, item.candidateName),
  });

  return NextResponse.json({ ok: true, invoiceNumber, filePath: storagePath, url: signed?.signedUrl ?? null });
}
