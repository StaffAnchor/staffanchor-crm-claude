import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/pro-sessions/admin-auth";
import { adminDb } from "@/lib/pro-sessions/core";
import { execute } from "@/lib/agent/executors";
import type { Payloads, ProposalRow } from "@/lib/agent/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

// The admin's decision on a proposal. Approving carries it out (sending, creating) and records exactly what happened; a message
// can be edited first. A proposal is claimed before it runs, so pressing approve twice never sends twice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const admin = adminDb();
  if (!admin || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not available" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { action?: string; edits?: { body?: string; subject?: string } };
  const { data } = await admin.from("agent_proposals").select("*").eq("id", id).eq("user_id", auth.userId).maybeSingle();
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const row = data as ProposalRow;
  const now = new Date().toISOString();

  if (b.action === "reject") {
    if (row.status !== "pending" && row.status !== "failed") return NextResponse.json({ error: `This was already ${row.status}.` }, { status: 409 });
    await admin.from("agent_proposals").update({ status: "rejected", decided_at: now, decided_by: auth.userId }).eq("id", id);
    return NextResponse.json({ ok: true, status: "rejected" });
  }
  if (b.action !== "approve") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  // Claim it: only one request can move it out of pending (or failed, for a retry).
  const { data: claimed } = await admin.from("agent_proposals").update({ status: "approved", decided_at: now, decided_by: auth.userId, error: null }).eq("id", id).in("status", ["pending", "failed"]).select("id").maybeSingle();
  if (!claimed) return NextResponse.json({ error: "This was already handled." }, { status: 409 });

  let payload = row.payload as Record<string, unknown>;
  const body = typeof b.edits?.body === "string" ? b.edits.body.trim().slice(0, 4000) : "";
  const subject = typeof b.edits?.subject === "string" ? b.edits.subject.trim().slice(0, 200) : "";
  if ((row.kind === "wa_reply" || row.kind === "email" || row.kind === "note") && body) payload = { ...payload, ...(row.kind === "note" ? { text: body } : { body }) };
  if (row.kind === "email" && subject) payload = { ...payload, subject };
  if (payload !== row.payload) await admin.from("agent_proposals").update({ payload }).eq("id", id);

  const out = await execute({ userId: auth.userId, supabase: auth.supabase, admin, cookie: req.headers.get("cookie") ?? "", origin: req.nextUrl.origin }, { kind: row.kind, payload: payload as Payloads[typeof row.kind] });
  await admin.from("agent_proposals").update({ status: out.ok ? "approved" : "failed", result: out, error: out.ok ? null : out.message }).eq("id", id);
  await admin.from("audit_log").insert({ actor: auth.userId, action: out.ok ? "agent_proposal_approved" : "agent_proposal_failed", entity: "agent_proposal", entity_id: id, detail: { kind: row.kind, title: row.title, message: out.message } });
  return NextResponse.json({ ok: out.ok, status: out.ok ? "approved" : "failed", outcome: out });
}
