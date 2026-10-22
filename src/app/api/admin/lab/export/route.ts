import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { loadCohort } from "@/lib/lab/data";
import { cohortCsv, cohortPdf, reportFileName } from "@/lib/lab/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The same report, for the facilitator from inside the CRM. Admin only.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const id = url.searchParams.get("cohortId") ?? "";
  const db = adminDb();
  const data = db && /^[0-9a-f-]{36}$/i.test(id) ? await loadCohort(db, id) : null;
  if (!data) return NextResponse.json({ error: "Cohort not found." }, { status: 404 });
  const pdf = url.searchParams.get("format") === "pdf";
  const body = pdf ? new Uint8Array(await cohortPdf(data)) : cohortCsv(data);
  return new NextResponse(body, { headers: { "Content-Type": pdf ? "application/pdf" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${reportFileName(data, pdf ? "pdf" : "csv")}"`, "Cache-Control": "no-store" } });
}
