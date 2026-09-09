import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractInvoiceFromPdf } from "@/lib/invoice-extractor";

// Historical invoice backfill (1.5-2 years of pre-CRM billing): one PDF per
// call, called in a loop from the client so the UI can show per-file
// progress rather than one opaque bulk request. Each call: uploads the PDF
// to the private 'invoices' bucket, extracts+parses fields via AI, matches
// (or creates) the client, and inserts a historical_invoices row.
//
// Client matching is deliberately simple (normalized exact match) rather
// than fuzzy/trigram -- per the "auto-create, flag for review" decision, a
// slightly-off name creating a duplicate client is an acceptable, visible,
// easily-merged cost; a fuzzy matcher silently attaching an invoice to the
// WRONG existing client is a much worse, invisible failure mode for money.

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

function normalizeClientName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .replace(/\b(pvt|private|ltd|limited|llp|inc|incorporated|llc|co)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase, userId } = auth;

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return NextResponse.json({ ok: false, note: "No AI provider API key configured on this deployment" }, { status: 200 });
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
  }
  if (!/\.pdf$/i.test(file.name)) {
    return NextResponse.json({ ok: false, error: "Only PDF files are supported" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();

  // Upload first so we still have the source file on record even if
  // extraction/parsing fails below -- a failed parse should still be
  // reviewable/re-tryable from the original PDF, not lost.
  const storagePath = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadError } = await supabase.storage.from("invoices").upload(storagePath, buffer, {
    contentType: "application/pdf",
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, error: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const extraction = await extractInvoiceFromPdf(buffer);
  if (!extraction.ok) {
    const { error: insertError, data: inserted } = await supabase
      .from("historical_invoices")
      .insert({
        file_path: storagePath,
        original_filename: file.name,
        needs_review: true,
        parse_error: extraction.error,
        imported_by: userId,
      })
      .select("id")
      .single();
    return NextResponse.json({
      ok: true,
      invoiceId: inserted?.id ?? null,
      parsed: false,
      error: extraction.error,
      insertError: insertError?.message,
    });
  }

  const { fields, needsReview, rawText } = extraction;

  let clientId: string | null = null;
  let clientCreated = false;
  if (fields.client_name) {
    const normalized = normalizeClientName(fields.client_name);
    const { data: existingClients } = await supabase.from("clients").select("id, name");
    const match = (existingClients ?? []).find((c) => normalizeClientName(c.name) === normalized);
    if (match) {
      clientId = match.id;
    } else {
      const { data: newClient, error: clientError } = await supabase
        .from("clients")
        .insert({ name: fields.client_name, created_via: "invoice_import" })
        .select("id")
        .single();
      if (!clientError && newClient) {
        clientId = newClient.id;
        clientCreated = true;
      }
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("historical_invoices")
    .insert({
      client_id: clientId,
      invoice_number: fields.invoice_number,
      invoice_date: fields.invoice_date,
      gross_amount: fields.gross_amount,
      gst_amount: fields.gst_amount,
      net_amount: fields.net_amount,
      file_path: storagePath,
      original_filename: file.name,
      raw_extracted: { ...fields, raw_text_excerpt: rawText.slice(0, 2000) },
      needs_review: needsReview || !clientId,
      imported_by: userId,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    invoiceId: inserted.id,
    parsed: true,
    needsReview: needsReview || !clientId,
    clientCreated,
    fields,
  });
}
