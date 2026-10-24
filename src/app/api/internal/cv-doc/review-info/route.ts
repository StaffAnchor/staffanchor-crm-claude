import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { DOC_COLUMNS, validReviewToken, type DocRow } from "@/lib/cv-doc/store";
import { sanitizeDoc, sections } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";

// What the candidate's private review link shows: their CV as it was shared, and their own answer so far. Only a shared
// version can be opened, and only by its own link. Called only by the jobs site.
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
  const { data: newer } = await db.from("cv_docs").select("version").eq("brief_id", row.brief_id).gt("version", row.version).limit(1);
  const content = sanitizeDoc(row.content);
  const photoUrl = content.header.showPhoto && brief?.photo_path ? (await db.storage.from("resume-orders").createSignedUrl(brief.photo_path as string, 3600)).data?.signedUrl ?? null : null;
  return NextResponse.json({
    ok: true, name: brief?.name ?? "", version: row.version, status: row.status, content, sections: sections(content), photoUrl,
    response: row.response, superseded: (newer?.length ?? 0) > 0,
  });
}
