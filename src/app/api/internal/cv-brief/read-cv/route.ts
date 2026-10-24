import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/pro-sessions/core";
import { requireInternal } from "@/lib/pro-sessions/internal-auth";
import { COLUMNS, readCvIntoBrief, validToken, type BriefRow } from "@/lib/cv-brief/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The jobs site has put the candidate's CV in private storage; this keeps its path and reads job history out of it.
export async function POST(req: NextRequest) {
  const denied = requireInternal(req);
  if (denied) return denied;
  const db = adminDb();
  if (!db) return NextResponse.json({ ok: false }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { token?: string; cvPath?: string; cvName?: string };
  if (!validToken(b.token) || typeof b.cvPath !== "string" || !b.cvPath.startsWith(`cvbrief/${b.token}/`)) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });
  const { data: row } = await db.from("cv_briefs").select(COLUMNS).eq("token", b.token).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "Link not found." }, { status: 404 });

  await db.from("cv_briefs").update({ cv_path: b.cvPath, cv_name: (b.cvName ?? "").slice(0, 160) || null, updated_at: new Date().toISOString() }).eq("id", row.id);
  const r = await readCvIntoBrief(db, row as BriefRow, b.cvPath);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error });
  await db.from("cv_briefs").update({ data: r.data, started_at: row.started_at ?? new Date().toISOString(), status: row.status === "sent" ? "started" : row.status }).eq("id", row.id);
  return NextResponse.json({ ok: true, jobs: r.jobs, data: r.data });
}
