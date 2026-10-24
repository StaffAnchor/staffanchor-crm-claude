import type { Ctx, ProposalKind } from "./types";

// Calls one of the CRM's own routes as the signed-in admin (their cookie is passed on). Approved proposals use this, so every
// rule those routes enforce (phone holds, opt-outs, the 24-hour window, no repeat sends) applies to the assistant too.
export async function callRoute(ctx: Pick<Ctx, "cookie" | "origin">, path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`${ctx.origin}${path}`, { method: "POST", headers: { "Content-Type": "application/json", cookie: ctx.cookie }, body: JSON.stringify(body), cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } catch (e) {
    return { status: 502, json: { ok: false, error: e instanceof Error ? e.message : "The request failed." } };
  }
}

/** Saves a proposal, shows it in the chat, and tells the AI it has NOT been sent so it never claims otherwise. */
export async function createProposal(ctx: Ctx, p: { kind: ProposalKind; title: string; summary: string; payload: unknown; preview?: unknown }) {
  const { data, error } = await ctx.admin.from("agent_proposals").insert({ thread_id: ctx.threadId, user_id: ctx.userId, kind: p.kind, title: p.title.slice(0, 200), summary: p.summary.slice(0, 1200), payload: p.payload, preview: p.preview ?? null }).select("id").single();
  if (error || !data) return { ok: false as const, error: "Couldn't save the proposal." };
  await ctx.admin.from("agent_messages").insert({ thread_id: ctx.threadId, role: "note", content: { proposal: data.id } });
  ctx.emit({ t: "proposal", id: data.id as string });
  return {
    ok: true as const,
    proposal_id: data.id as string,
    status: "waiting for the admin's approval",
    important: "This has NOT been sent or done. It is now shown to the admin as a card to approve, edit or reject. Do not say it was sent.",
  };
}
