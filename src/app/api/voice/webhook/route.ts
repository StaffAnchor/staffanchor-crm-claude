import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { getProvider } from "@/lib/voice/provider";
import { RECORDING_DAYS } from "@/lib/voice/policy";
import { readVoiceCall } from "@/lib/voice/read";
import { applyVoiceOutcome } from "@/lib/voice/apply";

export const runtime = "nodejs";
export const maxDuration = 60;

// Where the voice provider reports a call: started, finished, not answered or failed, with the transcript. Protected by a
// shared secret. A finished call is read and applied only when its campaign is approved and running.
export async function POST(req: Request) {
  const secret = process.env.VOICE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  if (req.headers.get("x-voice-secret") !== secret) return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });

  const body = await req.json().catch(() => null);
  const provider = getProvider(new URL(req.url).searchParams.get("p") ?? process.env.VOICE_PROVIDER ?? "sarvam");
  const ev = provider.parseWebhook(body);
  if (!ev) return NextResponse.json({ error: "Not a call event" }, { status: 400 });

  const { data } = await admin.from("voice_calls").select("id, candidate_id, mandate_id, attempts, applied_at, voice_campaigns(status, name_company)").eq("provider_call_id", ev.providerCallId).maybeSingle();
  const call = data as unknown as { id: string; candidate_id: string; mandate_id: string; attempts: number; applied_at: string | null; voice_campaigns: { status: string; name_company: boolean } | null } | null;
  if (!call) return NextResponse.json({ error: "Unknown call" }, { status: 404 });

  const patch: Record<string, unknown> = { status: ev.status === "completed" ? "completed" : ev.status };
  if (ev.durationS != null) patch.duration_s = Math.round(ev.durationS);
  if (ev.startedAt) patch.started_at = ev.startedAt;
  if (ev.endedAt) patch.ended_at = ev.endedAt;
  if (ev.transcript) patch.transcript = ev.transcript.slice(0, 20000);
  if (ev.recordingUrl) {
    patch.recording_path = ev.recordingUrl;
    patch.recording_expires_at = new Date(Date.now() + RECORDING_DAYS * 86_400_000).toISOString();
  }
  // Not answered: try again in the next calling window, up to three attempts in all.
  if (ev.status === "no_answer") {
    if (call.attempts < 3) {
      patch.status = "queued";
      patch.next_attempt_at = new Date(Date.now() + 4 * 3_600_000).toISOString();
    }
  }
  await admin.from("voice_calls").update(patch).eq("id", call.id);

  let applied = false;
  const running = call.voice_campaigns && ["approved", "running"].includes(call.voice_campaigns.status);
  if (ev.status === "completed" && ev.transcript && running && !call.applied_at) {
    let clientName: string | null = null;
    if (call.voice_campaigns?.name_company) {
      const { data: m } = await admin.from("mandates").select("client_name").eq("id", call.mandate_id).maybeSingle();
      clientName = (m as { client_name: string | null } | null)?.client_name ?? null;
    }
    const r = await readVoiceCall(admin, { candidateId: call.candidate_id, mandateId: call.mandate_id, transcript: ev.transcript, clientName });
    if (r.ok) {
      await applyVoiceOutcome(admin, call, ev.transcript, r.outcome);
      applied = true;
    }
  }
  return NextResponse.json({ ok: true, applied });
}
