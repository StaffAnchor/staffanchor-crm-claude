import { NextResponse } from "next/server";
import { requireVoiceStaff } from "@/lib/voice/auth";
import { readVoiceCall, type VoiceOutcome } from "@/lib/voice/read";
import { applyVoiceOutcome } from "@/lib/voice/apply";

export const runtime = "nodejs";
export const maxDuration = 60;
const UUID = /^[0-9a-f-]{36}$/i;

type Row = { id: string; candidate_id: string; mandate_id: string; status: string; transcript: string | null; outcome: VoiceOutcome | null; applied_at: string | null; voice_campaigns: { name_company: boolean } | null };

// Test a call without any voice provider: paste what was said, see what the system would take from it, and apply it.
// The same reading and the same rules are used for a real call, so this is how the setup is checked before anyone is rung.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireVoiceStaff();
  if (who instanceof NextResponse) return who;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const b = (await req.json().catch(() => ({}))) as { mode?: string; transcript?: string };
  const { data } = await who.admin.from("voice_calls").select("id, candidate_id, mandate_id, status, transcript, outcome, applied_at, voice_campaigns(name_company)").eq("id", id).maybeSingle();
  const call = data as unknown as Row | null;
  if (!call) return NextResponse.json({ error: "Call not found" }, { status: 404 });
  if (["dialing", "in_progress"].includes(call.status)) return NextResponse.json({ error: "This call is in progress." }, { status: 409 });

  if (b.mode === "read") {
    if (call.applied_at) return NextResponse.json({ error: "This call was already applied." }, { status: 409 });
    const transcript = (b.transcript ?? "").trim();
    if (transcript.length < 20) return NextResponse.json({ error: "Paste more of the call." }, { status: 400 });
    let clientName: string | null = null;
    if (call.voice_campaigns?.name_company) {
      const { data: m } = await who.admin.from("mandates").select("client_name").eq("id", call.mandate_id).maybeSingle();
      clientName = (m as { client_name: string | null } | null)?.client_name ?? null;
    }
    const r = await readVoiceCall(who.admin, { candidateId: call.candidate_id, mandateId: call.mandate_id, transcript, clientName });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    await who.admin.from("voice_calls").update({ transcript: transcript.slice(0, 20000), outcome: r.outcome, status: call.status === "queued" ? "test" : call.status }).eq("id", id);
    return NextResponse.json({ ok: true, outcome: r.outcome });
  }

  if (b.mode === "apply") {
    if (call.applied_at) return NextResponse.json({ error: "This call was already applied." }, { status: 409 });
    if (!call.outcome || !call.transcript) return NextResponse.json({ error: "Read the call first." }, { status: 400 });
    const r = await applyVoiceOutcome(who.admin, call, call.transcript, call.outcome);
    return NextResponse.json({ ok: true, filled: r.filled });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
