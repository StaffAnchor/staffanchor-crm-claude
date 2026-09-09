import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderInvoicePdf } from "@/lib/invoice-pdf";
import { resolveTrancheInvoiceData, type InvoiceOverrides } from "@/lib/invoice-generation";

// Renders the exact same document generate-invoice/route.ts would produce,
// but mints nothing: no invoice number allocated, nothing uploaded to
// storage, no tranche status change. Lets the admin see (and fix) the
// candidate name/designation/location/DOJ/billing amount/GST office before
// committing to a numbered, sent document -- per "provide an option to
// preview and add missing details". Returns the PDF inline as base64 for
// the modal's <iframe>, plus the resolved field values and the client's
// full GST registration list so the picker can offer alternatives.

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
    // Still ship back whatever was resolvable (candidate name, designation,
    // location, DOJ, client) so the preview modal can populate its form and
    // let the admin edit/fill in the rest, instead of the whole form
    // staying blank just because e.g. GST registration is missing.
    return NextResponse.json(
      {
        ok: false,
        error: resolved.error,
        client: resolved.client ?? null,
        item: resolved.item ?? null,
        registrations: resolved.registrations ?? [],
      },
      { status: resolved.status }
    );
  }
  const { client, registration, registrations, item } = resolved;

  const pdfBuffer = await renderInvoicePdf({
    kind,
    invoiceNumber: `DRAFT/${kind === "proforma" ? "PI" : "INV"}`,
    invoiceDate: new Date(),
    client: {
      name: client.name,
      gstin: registration.gstin,
      billingAddress: registration.billing_address,
      stateCode: registration.state_code,
    },
    item,
  });

  return NextResponse.json({
    ok: true,
    pdfBase64: pdfBuffer.toString("base64"),
    client,
    registrations,
    selectedRegistrationId: registration.id,
    item,
  });
}
