import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { createDraft } from "@/lib/cv-doc/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Writes a new CV draft from a candidate's form answers. Admin only. Nothing is sent to the candidate.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const db = adminDb();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { briefId?: string; polish?: boolean };
  if (!b.briefId || !/^[0-9a-f-]{36}$/i.test(b.briefId)) return NextResponse.json({ error: "Form not found." }, { status: 400 });
  const row = await createDraft(db, b.briefId, auth.userId, b.polish !== false);
  return row ? NextResponse.json({ ok: true, id: row.id }) : NextResponse.json({ error: "Couldn't write the draft." }, { status: 500 });
}
