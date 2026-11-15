import type { CallPlan } from "@/lib/voice/plan";

// The voice vendor sits behind this small interface so the rest of the system never depends on one company. "mock" works
// without any account, for testing. "sarvam" is declared but not connected: its call and webhook formats have to be
// confirmed against Sarvam's documentation with a real account before any call is placed.

export type NormalizedEvent = {
  providerCallId: string;
  status: "in_progress" | "completed" | "no_answer" | "failed";
  durationS?: number;
  transcript?: string;
  recordingUrl?: string;
  startedAt?: string;
  endedAt?: string;
};

export type PlaceCallInput = { callId: string; phone: string; plan: CallPlan; webhookUrl: string };

export interface VoiceProvider {
  name: string;
  configured(): boolean;
  /** Starts the call and returns the vendor's id for it. */
  placeCall(input: PlaceCallInput): Promise<{ providerCallId: string }>;
  /** Turns the vendor's callback into our shape, or null if it is not one we understand. */
  parseWebhook(body: unknown): NormalizedEvent | null;
}

const mock: VoiceProvider = {
  name: "mock",
  configured: () => true,
  async placeCall(i) {
    return { providerCallId: `mock-${i.callId}` };
  },
  parseWebhook(body) {
    const b = body as Partial<NormalizedEvent> | null;
    return b && typeof b.providerCallId === "string" && typeof b.status === "string" ? (b as NormalizedEvent) : null;
  },
};

const sarvam: VoiceProvider = {
  name: "sarvam",
  configured: () => !!process.env.SARVAM_API_KEY && !!process.env.SARVAM_AGENT_ID && process.env.SARVAM_CONNECTED === "yes",
  async placeCall() {
    throw new Error("Sarvam is not connected yet. Add the account keys, confirm the call format with a test, then set SARVAM_CONNECTED=yes.");
  },
  parseWebhook() {
    return null;
  },
};

export function getProvider(name: string): VoiceProvider {
  return name === "mock" ? mock : sarvam;
}
