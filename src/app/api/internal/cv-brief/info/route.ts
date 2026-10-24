import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { sanitize } from "@/lib/cv-brief/config";
import { validToken } from "@/lib/cv-brief/store";

export const dynamic = "force-dynamic";

// What the candidate's own form link shows: their answers so far and nothing else. Called only by the jobs site.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!validToken(token)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: b } = await db.from("cv_briefs").select("name, status, data, cv_name, consent_at, submitted_at, updated_at").eq("token", token).maybeSingle();
  if (!b) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  return NextResponse.json({ ok: true, name: b.name, status: b.status, data: sanitize(b.data), cvName: b.cv_name, consent: !!b.consent_at, submittedAt: b.submitted_at, updatedAt: b.updated_at });
}
