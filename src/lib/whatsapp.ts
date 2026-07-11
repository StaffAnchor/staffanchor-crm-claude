// Direct Meta WhatsApp Cloud API layer (Phase 2, Task 2) -- bypasses paid
// middleware (Twilio/Gupshup/etc.) entirely, talking straight to Meta's
// Graph API on its free tier (you only ever pay Meta's own per-message
// rates, no BSP markup).
//
// Deliberately env-var-gated and NO-OP (never throws) when credentials
// aren't configured yet, mirroring the existing GEMINI_API_KEY pattern
// used across ai-passport.ts / generate-jd / candidate-match. Until
// WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are set in Vercel,
// every call here returns { ok: false, status: "not_configured" }
// instead of erroring, so the rest of the app (Inbox "Send Update"
// button) can ship now and light up automatically the moment the real
// credentials are added -- no code changes needed then.

const GRAPH_API_VERSION = "v20.0";

export type SendTemplateResult =
  | { ok: true; metaMessageId: string }
  | { ok: false; status: "not_configured"; error: string }
  | { ok: false; status: "send_failed"; error: string };

type TemplateComponent = {
  type: "body";
  parameters: { type: "text"; text: string }[];
};

/**
 * Sends a pre-approved WhatsApp template message via the Cloud API.
 * `templateName` must already exist and be approved in the Meta Business
 * Manager for this to actually deliver -- Meta rejects unknown/unapproved
 * template names with a 400.
 */
export async function sendWhatsAppTemplate({
  to,
  templateName,
  languageCode = "en_US",
  bodyParams = [],
}: {
  to: string;
  templateName: string;
  languageCode?: string;
  bodyParams?: string[];
}): Promise<SendTemplateResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    return {
      ok: false,
      status: "not_configured",
      error:
        "WhatsApp isn't connected yet -- WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID aren't set.",
    };
  }

  const toDigitsOnly = to.replace(/[^\d]/g, "");
  if (!toDigitsOnly) {
    return { ok: false, status: "send_failed", error: "Candidate has no usable phone number." };
  }

  const components: TemplateComponent[] = bodyParams.length
    ? [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }]
    : [];

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toDigitsOnly,
          type: "template",
          template: {
            name: templateName,
            language: { code: languageCode },
            ...(components.length ? { components } : {}),
          },
        }),
      }
    );

    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        status: "send_failed",
        error: body?.error?.message ?? `Meta API returned ${res.status}`,
      };
    }

    const metaMessageId = body?.messages?.[0]?.id;
    if (!metaMessageId) {
      return { ok: false, status: "send_failed", error: "No message id in Meta's response." };
    }

    return { ok: true, metaMessageId };
  } catch (err) {
    return {
      ok: false,
      status: "send_failed",
      error: err instanceof Error ? err.message : "Unknown error calling Meta API.",
    };
  }
}

/**
 * Maps a recruiter_inbox task_type to the WhatsApp template that should be
 * sent for it. Template *names* are read from env vars rather than
 * hardcoded, since the actual approved template names in Meta's Business
 * Manager are chosen at approval time (often localized/renamed) -- set
 * WHATSAPP_TEMPLATE_INTERVIEW_COORDINATION / WHATSAPP_TEMPLATE_OFFER_FOLLOWUP
 * once templates are approved, no code change needed.
 */
export function templateNameForTaskType(taskType: string): string | null {
  if (taskType === "TRIGGER_INTERVIEW_COORDINATION") {
    return process.env.WHATSAPP_TEMPLATE_INTERVIEW_COORDINATION ?? null;
  }
  if (taskType === "FOLLOW_UP_ON_OFFER") {
    return process.env.WHATSAPP_TEMPLATE_OFFER_FOLLOWUP ?? null;
  }
  return null;
}
