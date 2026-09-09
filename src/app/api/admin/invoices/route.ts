import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

// Lists every imported historical invoice for the review table + monthly/
// annual gross-net rollup on the Billing page. Rollup is computed here
// (not client-side) so it reflects every row, not just whatever page of
// the review table happens to be visible.
export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { data, error } = await supabase
    .from("historical_invoices")
    .select("id, invoice_number, invoice_date, gross_amount, gst_amount, net_amount, needs_review, review_notes, parse_error, original_filename, file_path, created_at, clients(id, name, created_via)")
    .order("invoice_date", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const monthly = new Map<string, { gross: number; net: number; count: number }>();
  const annual = new Map<string, { gross: number; net: number; count: number }>();
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const monthKey = r.invoice_date.slice(0, 7); // yyyy-mm
    const yearKey = r.invoice_date.slice(0, 4);
    const gross = r.gross_amount ?? 0;
    const net = r.net_amount ?? 0;
    const m = monthly.get(monthKey) ?? { gross: 0, net: 0, count: 0 };
    m.gross += gross;
    m.net += net;
    m.count += 1;
    monthly.set(monthKey, m);
    const y = annual.get(yearKey) ?? { gross: 0, net: 0, count: 0 };
    y.gross += gross;
    y.net += net;
    y.count += 1;
    annual.set(yearKey, y);
  }

  return NextResponse.json({
    invoices: rows,
    monthly: Array.from(monthly.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => b.month.localeCompare(a.month)),
    annual: Array.from(annual.entries())
      .map(([year, v]) => ({ year, ...v }))
      .sort((a, b) => b.year.localeCompare(a.year)),
    needsReviewCount: rows.filter((r) => r.needs_review).length,
  });
}

// Inline edit from the review table: correct a mis-parsed amount/date/
// client, or reassign to a different client_id, then clear needs_review.
export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const body = await req.json();
  const { id, client_id, invoice_number, invoice_date, gross_amount, gst_amount, net_amount, needs_review } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const update: Record<string, unknown> = { reviewed_at: new Date().toISOString() };
  if (client_id !== undefined) update.client_id = client_id;
  if (invoice_number !== undefined) update.invoice_number = invoice_number;
  if (invoice_date !== undefined) update.invoice_date = invoice_date;
  if (gross_amount !== undefined) update.gross_amount = gross_amount;
  if (gst_amount !== undefined) update.gst_amount = gst_amount;
  if (net_amount !== undefined) update.net_amount = net_amount;
  if (needs_review !== undefined) update.needs_review = needs_review;

  const { error } = await supabase.from("historical_invoices").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase.from("historical_invoices").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
