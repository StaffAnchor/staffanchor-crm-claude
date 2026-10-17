import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { supabaseStore } from "@/lib/whatsapp-bot/store";
import { phoneKey } from "@/lib/whatsapp-threads";

export const WA_MAX_PER_PRESS = 20;
const GAP_MS = 700;

export type WaRecipient = { id: string; first: string; phone: string | null; bodyParams: string[]; urlButtonParam?: string; preview: string };

/**
 * Sends one approved template to a small, paced batch, started by a person pressing Send after reviewing. Each message is
 * logged to the chat history, and anyone who has opted out, has no usable number, or is on hold is skipped.
 */
export async function sendWhatsAppBatch(admin: SupabaseClient, templateName: string, people: WaRecipient[]) {
  const store = supabaseStore(admin);
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let firstError: string | null = null;
  for (const c of people.slice(0, WA_MAX_PER_PRESS)) {
    const key = phoneKey(c.phone);
    if (!key || key.length !== 10) {
      skipped++;
      continue;
    }
    const contact = await store.getContact(key);
    if (contact?.opted_out) {
      skipped++;
      continue;
    }
    const res = await sendWhatsAppTemplate({ to: key, templateName, bodyParams: c.bodyParams, ...(c.urlButtonParam ? { urlButtonParam: c.urlButtonParam } : {}) });
    await store.logMessage({
      candidate_id: c.id,
      direction: "outbound",
      to_phone: key,
      body_preview: c.preview,
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: templateName,
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      sent++;
      const existing = contact ?? (await store.createContact(key));
      void existing;
      await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: c.id });
    } else {
      failed++;
      firstError = firstError ?? res.error;
      if (res.status === "not_configured") break;
    }
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  return { sent, failed, skipped, over: Math.max(0, people.length - WA_MAX_PER_PRESS), error: firstError };
}
