import type { Content, Part } from "@google/generative-ai";
import type { SupabaseClient } from "@supabase/supabase-js";

// Conversations are stored exactly as the model produced them (including its tool calls), so a thread can be continued later.
// Old tool results are shortened when replayed, to keep long conversations cheap and fast.

const KEEP_FULL = 14;
const MAX_LEN = 300;

export async function loadHistory(admin: SupabaseClient, threadId: string): Promise<Content[]> {
  const { data } = await admin.from("agent_messages").select("role, content").eq("thread_id", threadId).neq("role", "note").order("id", { ascending: true }).limit(400);
  const rows = (data ?? []) as { role: string; content: Content }[];
  const out: Content[] = rows.map((r) => r.content);
  return out.map((c, i) => {
    if (i >= out.length - KEEP_FULL) return c;
    return { ...c, parts: c.parts.map((p): Part => (p.functionResponse ? { functionResponse: { name: p.functionResponse.name, response: { output: JSON.stringify(p.functionResponse.response).slice(0, MAX_LEN) + " (earlier result shortened)" } } } : p)) };
  });
}

export async function saveContents(admin: SupabaseClient, threadId: string, contents: Content[]) {
  if (!contents.length) return;
  await admin.from("agent_messages").insert(contents.map((c) => ({ thread_id: threadId, role: c.role === "function" ? "function" : c.role === "model" ? "model" : "user", content: c })));
  await admin.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId);
}

export type ShownMessage = { id: number; kind: "user" | "assistant" | "proposal"; text?: string; proposalId?: string };

/** The transcript as the admin sees it: what they said, what the assistant said, and the proposal cards, in order. */
export async function shownMessages(admin: SupabaseClient, threadId: string): Promise<ShownMessage[]> {
  const { data } = await admin.from("agent_messages").select("id, role, content").eq("thread_id", threadId).order("id", { ascending: true }).limit(600);
  const out: ShownMessage[] = [];
  for (const r of (data ?? []) as { id: number; role: string; content: Content & { proposal?: string } }[]) {
    if (r.role === "note") {
      if (r.content.proposal) out.push({ id: r.id, kind: "proposal", proposalId: r.content.proposal });
      continue;
    }
    const text = (r.content.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) continue;
    if (r.role === "user") out.push({ id: r.id, kind: "user", text });
    if (r.role === "model") out.push({ id: r.id, kind: "assistant", text });
  }
  return out;
}
