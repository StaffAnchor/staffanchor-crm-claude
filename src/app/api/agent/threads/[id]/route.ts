import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { shownMessages } from "@/lib/agent/store";

export const dynamic = "force-dynamic";

async function mine(id: string, userId: string) {
  const admin = adminDb();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin.from("agent_threads").select("id, title").eq("id", id).eq("user_id", userId).maybeSingle();
  return data ? { admin, thread: data as { id: string; title: string } } : null;
}

// One conversation: what was said, and the proposal cards with their current state.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const m = await mine(id, auth.userId);
  if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const [messages, { data: proposals }] = await Promise.all([
    shownMessages(m.admin, id),
    m.admin.from("agent_proposals").select("id, kind, title, summary, payload, preview, status, result, error, created_at").eq("thread_id", id),
  ]);
  return NextResponse.json({ thread: m.thread, messages, proposals: proposals ?? [] });
}

// Removes a conversation from the list. Proposals already made stay on record.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const m = await mine(id, auth.userId);
  if (!m) return NextResponse.json({ error: "Not found." }, { status: 404 });
  await m.admin.from("agent_threads").update({ archived: true }).eq("id", id);
  return NextResponse.json({ ok: true });
}
