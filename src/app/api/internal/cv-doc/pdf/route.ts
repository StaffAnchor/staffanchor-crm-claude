import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { cvFileName, renderCvPdf } from "@/lib/cv-doc/pdf";
import { DOC_COLUMNS, loadPhoto, validReviewToken, type DocRow } from "@/lib/cv-doc/store";
import { sanitizeDoc } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// The shared CV as a PDF for the candidate to download. Only a version that was shared, by its own link.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!validReviewToken(token)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("review_token", token).maybeSingle();
  const row = data as DocRow | null;
  if (!row || !["shared", "changes_requested", "final"].includes(row.status)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: brief } = await db.from("cv_briefs").select("name, photo_path").eq("id", row.brief_id).maybeSingle();
  const doc = sanitizeDoc(row.content);
  const photo = doc.header.showPhoto ? await loadPhoto(db, (brief?.photo_path as string | null) ?? null) : null;
  const pdf = await renderCvPdf(doc, photo);
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${cvFileName(doc.header.name || brief?.name || "Candidate", "pdf")}"`, "Cache-Control": "no-store" } });
}
