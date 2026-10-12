import crypto from "crypto";
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
  // The prompt that was sent. Only its hash and length are stored, never the
  // text, so the log can prove which input produced an output without keeping
  // a second copy of CV contents.
  prompt?: string;
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
      input_hash: input.prompt ? crypto.createHash("sha256").update(input.prompt).digest("hex").slice(0, 16) : null,
      input_chars: input.prompt ? input.prompt.length : null,
      // Output is kept (trimmed) only for matching and role drafts, whose
      // output is evidence text. CV extraction output is the CV itself, so
      // it is not copied here.
      output_text:
        input.result?.text && !input.purpose.startsWith("cv_facts") ? input.result.text.slice(0, 4000) : null,
      ok: !input.error,
      error: input.error ? input.error.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[ai-usage] failed to log", err instanceof Error ? err.message : err);
  }
}
