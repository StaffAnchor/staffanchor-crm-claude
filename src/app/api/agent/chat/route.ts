import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { runAgent } from "@/lib/agent/agent";
import type { StreamEvent } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// One message to the CRM assistant. The answer streams back as lines of JSON: what it is doing, the proposals it makes, and
// the final reply. Admin only. Nothing here sends or changes anything: that happens only when a proposal is approved.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const admin = adminDb();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { threadId?: string; message?: string };
  const message = (b.message ?? "").trim().slice(0, 6000);
  if (!message) return NextResponse.json({ error: "Write a message first." }, { status: 400 });

  let threadId = typeof b.threadId === "string" && /^[0-9a-f-]{36}$/i.test(b.threadId) ? b.threadId : "";
  if (threadId) {
    const { data } = await admin.from("agent_threads").select("id").eq("id", threadId).eq("user_id", auth.userId).maybeSingle();
    if (!data) return NextResponse.json({ error: "That conversation was not found." }, { status: 404 });
  } else {
    const { data, error } = await admin.from("agent_threads").insert({ user_id: auth.userId, title: message.slice(0, 80) }).select("id").single();
    if (error || !data) return NextResponse.json({ error: "Couldn't start the conversation." }, { status: 500 });
    threadId = data.id as string;
  }

  const enc = new TextEncoder();
  const origin = req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {
          /* the browser went away; the work still finishes and is saved */
        }
      };
      emit({ t: "status", text: "Thinking" });
      try {
        await runAgent({ userId: auth.userId, supabase: auth.supabase, admin, threadId, cookie, origin, emit }, message);
      } catch (e) {
        console.error("[agent] chat failed", e);
        emit({ t: "error", text: e instanceof Error && /paused/i.test(e.message) ? "AI is paused by an admin, so the assistant is off right now." : `The assistant hit a problem: ${e instanceof Error ? e.message.slice(0, 300) : "unknown"}` });
      }
      emit({ t: "done", threadId });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
