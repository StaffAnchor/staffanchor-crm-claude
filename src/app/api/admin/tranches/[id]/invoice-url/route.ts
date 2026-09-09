import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Signed download links for already-generated invoice PDFs -- the 'invoices'
// storage bucket is private (per the historical-import feature), so the
// Billing UI needs a fresh short-lived URL each time rather than a
// permanent public link.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const kind = req.nextUrl.searchParams.get("kind") === "final" ? "final" : "proforma";
  const col = kind === "final" ? "final_invoice_file_path" : "proforma_file_path";

  const { data: tranche, error } = await supabase.from("placement_fee_tranches").select(col).eq("id", id).single();
  if (error || !tranche) return NextResponse.json({ ok: false, error: error?.message ?? "Not found" }, { status: 404 });

  const filePath = (tranche as unknown as Record<string, string | null>)[col];
  if (!filePath) return NextResponse.json({ ok: false, error: "No invoice generated yet" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage.from("invoices").createSignedUrl(filePath, 60 * 15);
  if (signError || !signed) return NextResponse.json({ ok: false, error: signError?.message ?? "Could not sign URL" }, { status: 500 });

  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
