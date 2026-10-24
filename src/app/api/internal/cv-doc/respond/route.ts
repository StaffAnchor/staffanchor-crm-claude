import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { notifyResponse } from "@/lib/cv-doc/mail";
import { DOC_COLUMNS, validReviewToken, type DocRow } from "@/lib/cv-doc/store";
import { cleanResponse, sanitizeDoc, sections } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";

// The candidate's answer on their CV: approve it, or ask for changes with a comment on any section. They can change their answer
// until they have approved. The owner is told. Called only by the jobs site.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; decision?: string; comments?: unknown; general?: string };
  if (!validReviewToken(b.token)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("review_token", b.token).maybeSingle();
  const row = data as DocRow | null;
  if (!row || !["shared", "changes_requested", "final"].includes(row.status)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  if (row.status === "final") return NextResponse.json({ ok: false, error: "You have already approved this CV." }, { status: 409 });
  const ids = sections(sanitizeDoc(row.content)).map((s) => s.id);
  const r = cleanResponse({ decision: b.decision, comments: b.comments, general: b.general }, ids);
  if (!r) return NextResponse.json({ ok: false, error: "Choose approve or request changes." }, { status: 400 });
  if (r.decision === "changes" && !r.general && Object.keys(r.comments).length === 0) return NextResponse.json({ ok: false, error: "Tell us what you would like changed." }, { status: 400 });
  const now = new Date().toISOString();
  await db.from("cv_docs").update({ response: r, responded_at: now, status: r.decision === "approved" ? "final" : "changes_requested", updated_at: now }).eq("id", row.id);
  const { data: brief } = await db.from("cv_briefs").select("name").eq("id", row.brief_id).maybeSingle();
  await notifyResponse(brief?.name ?? "A candidate", row.version, row.brief_id, row.id, r);
  return NextResponse.json({ ok: true, decision: r.decision });
}
