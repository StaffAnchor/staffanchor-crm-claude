import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { currentLabMember, isLeader } from "@/lib/lab/auth";
import { loadCohort } from "@/lib/lab/data";
import { cohortCsv, cohortPdf, reportFileName } from "@/lib/lab/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The cohort report for sales heads, management and the facilitator. A manager gets a 403: the report names every manager.
export async function GET(req: NextRequest) {
  const me = await currentLabMember();
  if (!me) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  if (!isLeader(me.member.role)) return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  const db = adminDb();
  const data = db ? await loadCohort(db, me.cohort.id) : null;
  if (!data) return NextResponse.json({ error: "Not available right now." }, { status: 503 });
  const pdf = new URL(req.url).searchParams.get("format") === "pdf";
  const body = pdf ? new Uint8Array(await cohortPdf(data)) : cohortCsv(data);
  return new NextResponse(body, { headers: { "Content-Type": pdf ? "application/pdf" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${reportFileName(data, pdf ? "pdf" : "csv")}"`, "Cache-Control": "no-store" } });
}
