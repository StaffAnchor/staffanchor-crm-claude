import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";

// Moves an order along: draft sent, a revision requested, completed, or back to details received.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; notes?: string };
  const now = new Date().toISOString();
  const { data: o } = await db.from("resume_orders").select("revisions_used").eq("id", id).maybeSingle();
  if (!o) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const patch: Record<string, unknown> =
    b.action === "draft_sent" ? { status: "draft_sent", draft_sent_at: now }
    : b.action === "revision" ? { status: "revision", revisions_used: (o.revisions_used ?? 0) + 1 }
    : b.action === "completed" ? { status: "completed", completed_at: now }
    : b.action === "reopen" ? { status: "details_received", completed_at: null }
    : b.action === "notes" ? { notes: (b.notes ?? "").slice(0, 2000) }
    : {};
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  await db.from("resume_orders").update(patch).eq("id", id);
  return NextResponse.json({ ok: true });
}
