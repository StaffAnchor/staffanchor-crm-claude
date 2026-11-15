import { NextResponse } from "next/server";
import { requireVoiceStaff } from "@/lib/voice/auth";
import { createDraftCampaign, loadMandate } from "@/lib/voice/campaign";

export const runtime = "nodejs";
export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;

// Makes a DRAFT campaign for a role. Nothing is called until a person approves it and the voice provider is connected.
export async function POST(req: Request) {
  const who = await requireVoiceStaff();
  if (who instanceof NextResponse) return who;
  const b = (await req.json().catch(() => ({}))) as { mandateId?: string; candidateIds?: string[]; name?: string; nameCompany?: boolean };
  if (!UUID.test(b.mandateId ?? "") || !Array.isArray(b.candidateIds) || b.candidateIds.length === 0 || b.candidateIds.length > 200 || !b.candidateIds.every((i) => UUID.test(i))) return NextResponse.json({ error: "Pick the people to call." }, { status: 400 });
  const mandate = await loadMandate(who.admin, b.mandateId!);
  if (!mandate) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  const name = (b.name ?? "").trim().slice(0, 120) || `${mandate.role_title}, ${new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })}`;
  try {
    const r = await createDraftCampaign(who.admin, { mandate, candidateIds: b.candidateIds, name, nameCompany: b.nameCompany === true && !!mandate.client_name, userId: who.userId, provider: process.env.VOICE_PROVIDER === "mock" ? "mock" : "sarvam" });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't create the campaign." }, { status: 500 });
  }
}
