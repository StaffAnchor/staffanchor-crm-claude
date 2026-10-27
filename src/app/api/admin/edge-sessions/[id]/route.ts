import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { EMAIL_RE, adminDb } from "@/lib/pro-sessions/core";
import { cleanData } from "@/lib/session-report/store";

export const dynamic = "force-dynamic";
const ID = /^[0-9a-f-]{36}$/i;

// Saves the notes as they are typed (the workspace calls this a moment after each change), or marks the report final or
// open again.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !ID.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { data?: unknown; track?: string; level?: string; name?: string; email?: string; phone?: string };
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.data !== undefined) patch.data = cleanData(b.data);
  if (b.track === "sales" || b.track === "non_sales") patch.track = b.track;
  if (b.level === "individual" || b.level === "manager" || b.level === "leader") patch.level = b.level;
  if (typeof b.name === "string" && b.name.trim().length > 1) patch.candidate_name = b.name.trim().slice(0, 120);
  if (typeof b.email === "string") {
    const e = b.email.trim().toLowerCase();
    if (e === "" || EMAIL_RE.test(e)) patch.candidate_email = e || null;
  }
  if (typeof b.phone === "string") patch.candidate_phone = b.phone.trim().slice(0, 30) || null;
  const { error } = await db.from("session_reports").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  return NextResponse.json({ ok: true, savedAt: patch.updated_at });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !ID.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  if (action === "final") await db.from("session_reports").update({ status: "final", finalized_at: new Date().toISOString() }).eq("id", id);
  else if (action === "reopen") await db.from("session_reports").update({ status: "draft", finalized_at: null }).eq("id", id);
  else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return NextResponse.json({ ok: true });
}
