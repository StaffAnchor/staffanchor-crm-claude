import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { cleanData, COLUMNS, type ReportRow } from "@/lib/session-report/store";
import { renderSessionReport, reportFileName } from "@/lib/session-report/pdf";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The report as a PDF, always built from the latest notes. ?inline=1 opens it in the browser instead of downloading.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const { data } = await db.from("session_reports").select(COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  const r = data as ReportRow;
  const pdf = await renderSessionReport({ name: r.candidate_name, track: r.track, level: r.level, data: cleanData(r.data) });
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${reportFileName(r.candidate_name)}"`, "Cache-Control": "no-store" } });
}
