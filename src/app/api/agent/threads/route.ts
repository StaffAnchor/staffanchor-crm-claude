import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";

export const dynamic = "force-dynamic";

// The admin's recent conversations with the assistant.
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = adminDb();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const { data } = await admin.from("agent_threads").select("id, title, updated_at").eq("user_id", auth.userId).eq("archived", false).order("updated_at", { ascending: false }).limit(40);
  const { data: pending } = await admin.from("agent_proposals").select("thread_id").eq("user_id", auth.userId).eq("status", "pending");
  const counts: Record<string, number> = {};
  for (const p of (pending ?? []) as { thread_id: string | null }[]) if (p.thread_id) counts[p.thread_id] = (counts[p.thread_id] ?? 0) + 1;
  return NextResponse.json({ threads: ((data ?? []) as { id: string; title: string; updated_at: string }[]).map((t) => ({ ...t, pending: counts[t.id] ?? 0 })) });
}
