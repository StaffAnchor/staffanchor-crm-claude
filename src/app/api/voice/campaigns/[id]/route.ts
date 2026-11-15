import { NextResponse } from "next/server";
import { requireVoiceStaff } from "@/lib/voice/auth";

export const runtime = "nodejs";
const UUID = /^[0-9a-f-]{36}$/i;

// Approve, pause, resume or cancel a campaign. Only admins and recruiters can approve; a draft is never dialled.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireVoiceStaff();
  if (who instanceof NextResponse) return who;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  const { data: camp } = await who.admin.from("voice_campaigns").select("id, status").eq("id", id).maybeSingle();
  if (!camp) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const status = (camp as { status: string }).status;
  const now = new Date().toISOString();
  if (b.action === "approve") {
    if (!["admin", "recruiter"].includes(who.role)) return NextResponse.json({ error: "Only an admin or recruiter can approve." }, { status: 403 });
    if (status !== "draft") return NextResponse.json({ error: "Only a draft can be approved." }, { status: 409 });
    await who.admin.from("voice_campaigns").update({ status: "approved", approved_by: who.userId, approved_at: now }).eq("id", id);
  } else if (b.action === "pause" && ["approved", "running"].includes(status)) {
    await who.admin.from("voice_campaigns").update({ status: "paused" }).eq("id", id);
  } else if (b.action === "resume" && status === "paused") {
    await who.admin.from("voice_campaigns").update({ status: "approved" }).eq("id", id);
  } else if (b.action === "cancel" && !["done", "cancelled"].includes(status)) {
    await who.admin.from("voice_campaigns").update({ status: "cancelled" }).eq("id", id);
    await who.admin.from("voice_calls").update({ status: "skipped", skip_reason: "Campaign cancelled" }).eq("campaign_id", id).eq("status", "queued");
  } else {
    return NextResponse.json({ error: "That isn't possible in the campaign's current state." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
