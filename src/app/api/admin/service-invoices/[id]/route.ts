import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { sendServiceInvoice } from "@/lib/service-invoices";

// Emails an invoice to the customer. Used when they ask for it; nothing is sent automatically.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { to?: string };
  const r = await sendServiceInvoice(db, id, typeof b.to === "string" && b.to.trim() ? b.to : undefined);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
