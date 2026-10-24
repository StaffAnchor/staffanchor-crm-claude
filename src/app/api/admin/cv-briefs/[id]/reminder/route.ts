import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { sendReminder } from "@/lib/cv-brief/mail";

export const dynamic = "force-dynamic";

// Emails a reminder to a candidate who has not finished the CV form. It only ever runs when someone presses Send on the
// reminder screen, to the address and with the words shown there. Admin only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const db = adminDb();
  if (!db || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { to?: string; message?: string };
  const { data: row } = await db.from("cv_briefs").select("id, name, status, reminder_count").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  const r = await sendReminder(db, row, b.to ?? "", b.message ?? "");
  return r.ok ? NextResponse.json({ ok: true, sentTo: r.sentTo }) : NextResponse.json({ error: r.error }, { status: r.status });
}
