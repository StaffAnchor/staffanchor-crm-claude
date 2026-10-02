import { createClient } from "@supabase/supabase-js";
import type { GenerationResult } from "@/lib/ai-providers";

// Records one AI call in ai_usage_log (tokens, model, purpose) so spend and
// quality can be tracked. Never throws and never blocks the caller: a logging
// failure must not break the feature that made the AI call.
export async function logAiUsage(input: {
  purpose: string;
  refType?: string;
  refId?: string;
  result?: GenerationResult;
  error?: string;
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return;
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    await admin.from("ai_usage_log").insert({
      purpose: input.purpose,
      provider: input.result?.provider ?? null,
      model: input.result?.model ?? null,
      input_tokens: input.result?.usage?.inputTokens ?? null,
      output_tokens: input.result?.usage?.outputTokens ?? null,
      ref_type: input.refType ?? null,
      ref_id: input.refId ?? null,
      ok: !input.error,
      error: input.error ? input.error.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[ai-usage] failed to log", err instanceof Error ? err.message : err);
  }
}
