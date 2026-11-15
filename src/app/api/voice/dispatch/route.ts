import { NextResponse } from "next/server";
import { createClient as createAdmin } from "@supabase/supabase-js";
import { requireVoiceStaff } from "@/lib/voice/auth";
import { getProvider } from "@/lib/voice/provider";
import { DEFAULT_WINDOW, MAX_ATTEMPTS, inWindow } from "@/lib/voice/policy";
import { phoneKey } from "@/lib/whatsapp-bot/engine";
import type { CallPlan } from "@/lib/voice/plan";

export const runtime = "nodejs";
export const maxDuration = 60;
const BATCH = 5;

// Places the next few calls of approved campaigns. It runs only inside the calling window, only for approved campaigns,
// and re-checks the phone number and opt-out right before each call. With the provider not connected it places nothing and
// says so. Run it by hand (staff) or from a scheduler with the CRON_SECRET.
export async function POST(req: Request) {
  const cron = process.env.CRON_SECRET;
  const viaCron = !!cron && req.headers.get("authorization") === `Bearer ${cron}`;
  let admin;
  if (viaCron) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 });
    admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
  } else {
    const who = await requireVoiceStaff();
    if (who instanceof NextResponse) return who;
    admin = who.admin;
  }

  const now = new Date();
  if (!inWindow(now, DEFAULT_WINDOW)) return NextResponse.json({ ok: true, placed: 0, note: "Outside calling hours (10am to 7pm India time, Monday to Saturday)." });

  const { data: camps } = await admin.from("voice_campaigns").select("id, provider").in("status", ["approved", "running"]);
  let placed = 0;
  const notes: string[] = [];
  for (const camp of (camps ?? []) as { id: string; provider: string }[]) {
    const provider = getProvider(camp.provider);
    if (!provider.configured()) {
      notes.push(`${camp.provider} is not connected, so nothing was placed.`);
      continue;
    }
    const { data: rows } = await admin
      .from("voice_calls")
      .select("id, candidate_id, attempts, plan, next_attempt_at, candidates(phone, phone_hold, voice_opt_out_at)")
      .eq("campaign_id", camp.id)
      .eq("status", "queued")
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now.toISOString()}`)
      .limit(BATCH);
    for (const r of (rows ?? []) as unknown as { id: string; candidate_id: string; attempts: number; plan: CallPlan; candidates: { phone: string | null; phone_hold: boolean | null; voice_opt_out_at: string | null } | null }[]) {
      const c = r.candidates;
      const key = phoneKey(c?.phone);
      if (!c || c.voice_opt_out_at) {
        await admin.from("voice_calls").update({ status: "opted_out", skip_reason: "Asked not to be called" }).eq("id", r.id);
        continue;
      }
      if (!key || c.phone_hold) {
        await admin.from("voice_calls").update({ status: "skipped", skip_reason: "No usable phone number" }).eq("id", r.id);
        continue;
      }
      if (r.attempts >= MAX_ATTEMPTS) {
        await admin.from("voice_calls").update({ status: "no_answer", skip_reason: "No answer after three tries" }).eq("id", r.id);
        continue;
      }
      try {
        const origin = new URL(req.url).origin;
        const res = await provider.placeCall({ callId: r.id, phone: `+91${key}`, plan: r.plan, webhookUrl: `${origin}/api/voice/webhook?p=${provider.name}` });
        await admin.from("voice_calls").update({ status: "dialing", attempts: r.attempts + 1, last_attempt_at: now.toISOString(), provider_call_id: res.providerCallId }).eq("id", r.id);
        placed++;
      } catch (e) {
        notes.push(e instanceof Error ? e.message : "A call could not be placed.");
      }
    }
    await admin.from("voice_campaigns").update({ status: "running" }).eq("id", camp.id).eq("status", "approved");
  }
  return NextResponse.json({ ok: true, placed, notes });
}
