import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { sendShare } from "@/lib/cv-doc/mail";
import { DOC_COLUMNS, loadBrief, reviewLink, type DocRow } from "@/lib/cv-doc/store";

export const dynamic = "force-dynamic";

// Emails the candidate their private review link for an approved CV. It only ever runs when someone presses Send on the share
// screen, to the address and with the words shown there.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { to?: string; message?: string };
  const { data } = await db.from("cv_docs").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as DocRow;
  if (!["approved", "shared"].includes(row.status)) return NextResponse.json({ error: "Only an approved CV can be shared. Approve it first." }, { status: 409 });
  const loaded = await loadBrief(db, row.brief_id);
  const token = row.review_token ?? crypto.randomBytes(32).toString("hex");
  const r = await sendShare(loaded?.brief.name ?? "", b.to ?? "", b.message ?? "", reviewLink(token));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const now = new Date().toISOString();
  await db.from("cv_docs").update({ review_token: token, status: "shared", shared_at: now, shared_to: r.sentTo, updated_at: now }).eq("id", id);
  return NextResponse.json({ ok: true, sentTo: r.sentTo, link: reviewLink(token) });
}
