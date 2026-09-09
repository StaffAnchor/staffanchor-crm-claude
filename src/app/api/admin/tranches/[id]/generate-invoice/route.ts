import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf, invoicePrefix } from "@/lib/invoice-pdf";
import { resolveTrancheInvoiceData, type InvoiceOverrides } from "@/lib/invoice-generation";

// Generates the system's own Proforma or Tax (final) Invoice PDF for a
// placement_fee_tranche and advances its lifecycle in one step -- "Mark
// proforma sent" now actually produces the proforma PDF rather than just
// flipping a status flag, per "You can start generating both from this
// system only and track it." Numbering is auto-sequential per financial
// year (SA/PI/2026-27/001 / SA/INV/2026-27/001), picked by scanning existing
// numbers with the current FY's prefix and incrementing the max -- fine at
// this firm's volume (a handful of tranches a month), no separate counter
// table needed.
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

async function nextInvoiceNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  kind: "proforma" | "final"
): Promise<string> {
  const prefix = invoicePrefix(kind);
  const col = kind === "proforma" ? "proforma_invoice_number" : "final_invoice_number";
  const { data } = await supabase.from("placement_fee_tranches").select(col).like(col, `${prefix}%`);
  let max = 0;
  for (const row of (data ?? []) as unknown as Record<string, string | null>[]) {
    const val = row[col];
    if (!val) continue;
    const seq = parseInt(val.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
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

  const invoiceNumber = await nextInvoiceNumber(supabase, kind);
  const invoiceDate = new Date();

  const pdfBuffer = await renderInvoicePdf({
    kind,
    invoiceNumber,
    invoiceDate,
    client: {
      name: client.name,
      gstin: registration.gstin,
      billingAddress: registration.billing_address,
      stateCode: registration.state_code,
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

  const patch: Record<string, string> =
    kind === "proforma"
      ? { status: "proforma_sent", proforma_sent_at: new Date().toISOString(), proforma_invoice_number: invoiceNumber, proforma_file_path: storagePath }
      : { status: "final_invoiced", final_invoiced_at: new Date().toISOString(), final_invoice_number: invoiceNumber, final_invoice_file_path: storagePath };

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

  const { data: signed } = await supabase.storage.from("invoices").createSignedUrl(storagePath, 60 * 60);

  return NextResponse.json({ ok: true, invoiceNumber, filePath: storagePath, url: signed?.signedUrl ?? null });
}
