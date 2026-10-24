import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { cvFileName, renderCvPdf } from "@/lib/cv-doc/pdf";
import { renderCvDocx } from "@/lib/cv-doc/docx";
import { DOC_COLUMNS, loadBrief, loadPhoto, type DocRow } from "@/lib/cv-doc/store";
import { sanitizeDoc } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// The CV as a file for the person working on it. Admin only.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as DocRow;
  const loaded = await loadBrief(db, row.brief_id);
  const doc = sanitizeDoc(row.content);
  const photo = doc.header.showPhoto ? await loadPhoto(db, loaded?.brief.photo_path ?? null) : null;
  const name = doc.header.name || loaded?.brief.name || "Candidate";
  const isPdf: boolean = true;
  const body = isPdf ? await renderCvPdf(doc, photo) : await renderCvDocx(doc, photo);
  const inline = req.nextUrl.searchParams.get("inline") === "1" && isPdf;
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${cvFileName(name, "pdf")}"`,
      "Cache-Control": "no-store",
    },
  });
}
