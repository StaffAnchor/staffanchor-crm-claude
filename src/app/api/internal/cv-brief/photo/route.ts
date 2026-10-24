import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { validToken } from "@/lib/cv-brief/store";

export const dynamic = "force-dynamic";

// The candidate's optional photo for their CV. The jobs site has put the image in private storage; this keeps its path, or
// removes it. Called only by the jobs site.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; photoPath?: string | null };
  if (!validToken(b.token)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: row } = await db.from("cv_briefs").select("id, photo_path").eq("token", b.token).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });

  let next: string | null = null;
  if (typeof b.photoPath === "string") {
    if (!b.photoPath.startsWith(`cvbrief/${b.token}/photo-`)) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 400 });
    next = b.photoPath;
  }
  await db.from("cv_briefs").update({ photo_path: next, updated_at: new Date().toISOString() }).eq("id", row.id);
  // The previous photo is no longer needed.
  if (row.photo_path && row.photo_path !== next) await db.storage.from("resume-orders").remove([row.photo_path as string]);
  return NextResponse.json({ ok: true });
}
