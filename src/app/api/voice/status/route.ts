import { NextResponse } from "next/server";
import { requireVoiceStaff } from "@/lib/voice/auth";
import { getProvider } from "@/lib/voice/provider";

export const runtime = "nodejs";

/** Whether the voice provider is connected, so the page can say "setup mode" or "live". Never returns a key. */
export async function GET() {
  const who = await requireVoiceStaff();
  if (who instanceof NextResponse) return who;
  const name = process.env.VOICE_PROVIDER === "mock" ? "mock" : "sarvam";
  return NextResponse.json({ provider: name, connected: getProvider(name).configured(), webhookSecretSet: !!process.env.VOICE_WEBHOOK_SECRET });
}
