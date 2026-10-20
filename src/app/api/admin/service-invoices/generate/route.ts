import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { ensureServiceInvoice } from "@/lib/service-invoices";

// Makes the invoice for a paid booking or order that does not have one (for example if it failed at payment time).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { kind?: string; refId?: string };
  if ((b.kind !== "edge" && b.kind !== "resume") || !b.refId) return NextResponse.json({ error: "Missing details" }, { status: 400 });
  const inv = await ensureServiceInvoice(db, b.kind, b.refId);
  return inv ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "Couldn't make the invoice." }, { status: 500 });
}
