import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminDb } from "@/lib/pro-sessions/core";
import Chat, { type Thread } from "./chat";

export const dynamic = "force-dynamic";

// The CRM assistant. Admins only: it can look at everything and prepare messages and records, and an admin approves each one.
export default async function AgentPage({ searchParams }: { searchParams: Promise<{ ask?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
  if (profile?.role !== "admin") notFound();
  const admin = adminDb();
  const { data } = admin ? await admin.from("agent_threads").select("id, title, updated_at").eq("user_id", user.id).eq("archived", false).order("updated_at", { ascending: false }).limit(40) : { data: [] };
  const { data: pending } = admin ? await admin.from("agent_proposals").select("thread_id").eq("user_id", user.id).eq("status", "pending") : { data: [] };
  const counts: Record<string, number> = {};
  for (const p of (pending ?? []) as { thread_id: string | null }[]) if (p.thread_id) counts[p.thread_id] = (counts[p.thread_id] ?? 0) + 1;
  const threads: Thread[] = ((data ?? []) as { id: string; title: string; updated_at: string }[]).map((t) => ({ ...t, pending: counts[t.id] ?? 0 }));
  return <Chat firstName={(profile.full_name ?? "").split(/\s+/)[0] || "there"} initialThreads={threads} initialAsk={(sp.ask ?? "").slice(0, 1500) || undefined} />;
}
