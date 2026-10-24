import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { checkDoc } from "@/lib/cv-doc/checks";
import { DOC_COLUMNS, loadBrief, newVersionFrom, type DocRow } from "@/lib/cv-doc/store";
import { sanitizeDoc, type DocStatus } from "@/lib/cv-doc/types";

export const dynamic = "force-dynamic";

const FROM: Record<string, DocStatus[]> = {
  ready: ["draft"],
  reopen: ["in_review", "approved"],
  approve: ["draft", "in_review"],
  "new-version": ["approved", "shared", "changes_requested", "final"],
};

// Moves a CV version along: ready for approval, back to draft, approved, or a new version. Approving is the admin's decision
// and is refused while the checks have warnings, unless they have been seen and accepted.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; acknowledged?: boolean };
  const action = b.action ?? "";
  if (!(action in FROM)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as DocRow;
  if (!FROM[action].includes(row.status)) return NextResponse.json({ error: `That can't be done to a version that is "${row.status}".` }, { status: 409 });
  const now = new Date().toISOString();

  if (action === "new-version") {
    const v = await newVersionFrom(db, id, auth.userId);
    return v ? NextResponse.json({ ok: true, id: v.id }) : NextResponse.json({ error: "Couldn't start a new version." }, { status: 500 });
  }
  if (action === "ready") await db.from("cv_docs").update({ status: "in_review", updated_at: now }).eq("id", id);
  if (action === "reopen") await db.from("cv_docs").update({ status: "draft", approved_by: null, approved_at: null, updated_at: now }).eq("id", id);
  if (action === "approve") {
    const loaded = await loadBrief(db, row.brief_id);
    const warns = loaded ? checkDoc(sanitizeDoc(row.content), loaded.data, !!loaded.brief.photo_path).filter((f) => f.level === "warn") : [];
    if (warns.length && b.acknowledged !== true) return NextResponse.json({ error: `The checks found ${warns.length} ${warns.length === 1 ? "problem" : "problems"}.`, warns: warns.length }, { status: 409 });
    const { data: profile } = await auth.supabase.from("profiles").select("email, full_name").eq("id", auth.userId).single();
    await db.from("cv_docs").update({ status: "approved", approved_by: profile?.full_name || profile?.email || "Admin", approved_at: now, updated_at: now }).eq("id", id);
  }
  return NextResponse.json({ ok: true });
}
