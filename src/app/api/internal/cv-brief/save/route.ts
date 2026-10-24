import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { CONSENT_VERSION, sanitize } from "@/lib/cv-brief/config";
import { validToken } from "@/lib/cv-brief/store";

export const dynamic = "force-dynamic";

// Autosave and final submit. A submitted form can still be edited and sent again (it replaces, never duplicates).
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; data?: unknown; consent?: boolean; submit?: boolean };
  if (!validToken(b.token)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: row } = await db.from("cv_briefs").select("id, status, started_at, consent_at, submit_count").eq("token", b.token).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { data: sanitize(b.data), updated_at: now };
  if (!row.started_at) patch.started_at = now;
  if (b.consent === true && !row.consent_at) {
    patch.consent_at = now;
    patch.consent_version = CONSENT_VERSION;
  }
  if (b.submit === true) {
    patch.status = "submitted";
    patch.submitted_at = now;
    patch.submit_count = (row.submit_count ?? 0) + 1;
  } else if (row.status === "sent") {
    patch.status = "started";
  }
  const { error } = await db.from("cv_briefs").update(patch).eq("id", row.id);
  if (error) return NextResponse.json({ ok: false, error: "Couldn't save." }, { status: 500 });
  return NextResponse.json({ ok: true, savedAt: now });
}
