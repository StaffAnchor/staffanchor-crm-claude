import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { checkDoc } from "@/lib/cv-doc/checks";
import { DOC_COLUMNS, loadBrief, type DocRow } from "@/lib/cv-doc/store";
import { EDITABLE, sanitizeDoc } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";

// Autosave from the editor. Only a draft or a version waiting for approval can be edited;
// anything approved or with the candidate becomes a new version instead. Returns the checks for what was saved.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as DocRow;
  if (!EDITABLE.includes(row.status)) return NextResponse.json({ error: "This version is locked. Start a new version to change it." }, { status: 409 });
  const b = (await req.json().catch(() => ({}))) as { content?: unknown };
  const content = sanitizeDoc(b.content);
  const { error } = await db.from("cv_docs").update({ content, updated_at: new Date().toISOString(), ...(row.status === "in_review" ? { status: "draft" } : {}) }).eq("id", id);
  if (error) return NextResponse.json({ error: "Couldn't save." }, { status: 500 });
  const loaded = await loadBrief(db, row.brief_id);
  const flags = loaded ? checkDoc(content, loaded.data, !!loaded.brief.photo_path) : [];
  return NextResponse.json({ ok: true, flags, status: row.status === "in_review" ? "draft" : row.status });
}
