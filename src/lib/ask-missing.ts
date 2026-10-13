import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform, sendWhatsAppTemplate, profileDetailsTemplate, oneLine } from "@/lib/whatsapp";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { whatsappEmailLine } from "@/lib/whatsapp-entry";
import { missingKeyDetails } from "@/lib/key-details";
import { startOnboarding } from "@/lib/whatsapp-bot/flow";
import { candidatePrefill } from "@/lib/whatsapp-bot/engine";
import { supabaseStore, type CandidateLite } from "@/lib/whatsapp-bot/store";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";
import { detailsPhrase, renderDetailsMessage } from "@/lib/whatsapp-template-text";

// "Ask for missing details": ask one candidate for exactly what their profile lacks.
//  - Inside WhatsApp's 24-hour window: the assistant asks the missing questions in the chat and fills
//    the answers into the profile (blanks only). Free.
//  - Window closed: the approved details template, when one is set up (charged per message by Meta).
//  - Otherwise, when allowed, an email that lists what is missing and links to the profile form.
// Used by the one-candidate button and by the bulk ask, so both behave the same way.

export type SkipReason = "nothing_missing" | "no_phone" | "phone_hold" | "opted_out" | "staff" | "assistant_busy" | "recent" | "no_template" | "no_email";

export type AskResult =
  | { ok: true; via: "whatsapp" | "whatsapp_template" | "email"; count: number; note?: string }
  | { ok: false; skip?: SkipReason; error: string };

export type AskPlan = { ok: true; plan: "window" | "template"; count: number } | { ok: false; skip: SkipReason; error: string };

const SKIP_TEXT: Record<SkipReason, string> = {
  nothing_missing: "Nothing is missing from this profile.",
  no_phone: "No usable mobile number on file.",
  phone_hold: "This number is on hold until the candidate confirms it.",
  opted_out: "They asked not to get automatic messages.",
  staff: "This number belongs to the team.",
  assistant_busy: "The assistant is already asking them. Wait for their reply.",
  recent: "Already sent this request in the last 30 days.",
  no_template: "The 24-hour window is closed and no approved template is set up.",
  no_email: "No email on file.",
};

const RECENT_DAYS = 30;

function staffKeys(): Set<string> {
  return new Set((process.env.WHATSAPP_STAFF_NUMBERS ?? "").split(",").map((s) => s.replace(/\D/g, "").slice(-10)).filter((s) => s.length === 10));
}

/** What would happen for this candidate, without sending anything. */
export async function planAsk(admin: SupabaseClient, candidateId: string): Promise<AskPlan & { cand?: CandidateLite }> {
  const store = supabaseStore(admin);
  const cand = await store.getCandidate(candidateId);
  if (!cand) return { ok: false, skip: "no_phone", error: "Candidate not found" };
  const missing = missingKeyDetails({ ...cand });
  if (missing.length === 0) return { ok: false, skip: "nothing_missing", error: SKIP_TEXT.nothing_missing, cand };
  if (cand.phone_hold) return { ok: false, skip: "phone_hold", error: SKIP_TEXT.phone_hold, cand };
  const key = phoneKey(cand.phone);
  if (!key || key.length !== 10) return { ok: false, skip: "no_phone", error: SKIP_TEXT.no_phone, cand };
  if (staffKeys().has(key)) return { ok: false, skip: "staff", error: SKIP_TEXT.staff, cand };
  const contact = await store.getContact(key);
  if (contact?.opted_out) return { ok: false, skip: "opted_out", error: SKIP_TEXT.opted_out, cand };

  const nowMs = new Date().getTime();
  const { data: recentIn } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("direction", "inbound")
    .ilike("to_phone", `%${key}`)
    .gte("created_at", new Date(nowMs - WINDOW_MS).toISOString())
    .limit(1);
  if (recentIn && recentIn.length > 0) {
    const st = contact?.bot_state as { status?: string; startedAt?: string | null } | undefined;
    if (st?.status === "active" && st.startedAt && nowMs - new Date(st.startedAt).getTime() < WINDOW_MS) {
      return { ok: false, skip: "assistant_busy", error: SKIP_TEXT.assistant_busy, cand };
    }
    return { ok: true, plan: "window", count: missing.length, cand };
  }

  const templateName = profileDetailsTemplate();
  if (!templateName) return { ok: false, skip: "no_template", error: SKIP_TEXT.no_template, cand };
  const { data: sentBefore } = await admin
    .from("whatsapp_messages")
    .select("id")
    .eq("candidate_id", candidateId)
    .eq("template_name", templateName)
    .eq("status", "sent")
    .gte("created_at", new Date(nowMs - RECENT_DAYS * 86_400_000).toISOString())
    .limit(1);
  if (sentBefore && sentBefore.length > 0) return { ok: false, skip: "recent", error: SKIP_TEXT.recent, cand };
  return { ok: true, plan: "template", count: missing.length, cand };
}

/** Ask one candidate. With `emailFallback`, a closed window with no template falls back to an email. */
export async function askMissingDetails(
  admin: SupabaseClient,
  actorId: string,
  candidateId: string,
  opts: { emailFallback: boolean }
): Promise<AskResult> {
  const store = supabaseStore(admin);
  const p = await planAsk(admin, candidateId);
  const cand = p.cand;
  if (!cand) return { ok: false, error: p.ok ? "Candidate not found" : p.error };
  const missing = missingKeyDetails({ ...cand });
  const key = phoneKey(cand.phone);
  const nowMs = new Date().getTime();

  // Skips that an email cannot cure are final. A closed window with no template can still use email.
  if (!p.ok && !(opts.emailFallback && (p.skip === "no_template" || p.skip === "no_phone" || p.skip === "recent"))) {
    return { ok: false, skip: p.skip, error: p.error };
  }

  if (p.ok && p.plan === "window" && key) {
    let contact = await store.getContact(key);
    const started = startOnboarding({ prefill: candidatePrefill(cand), existingCandidateId: cand.id, hasResume: !!cand.resume_file_url, nowIso: new Date(nowMs).toISOString(), recruiterAsked: true });
    started.state.candidateId = cand.id;
    for (const text of started.replies) {
      const res = await sendWhatsAppFreeform({ to: key, body: text });
      await store.logMessage({
        candidate_id: cand.id,
        direction: "outbound",
        to_phone: key,
        body_preview: text,
        status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
        template_name: "bot:onboarding",
        meta_message_id: res.ok ? res.metaMessageId : null,
        error: res.ok ? null : res.error,
      });
      if (!res.ok) return { ok: false, error: `WhatsApp didn't send it: ${res.error}` };
    }
    if (!contact) contact = await store.createContact(key);
    await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: cand.id, bot_paused: false, needs_human: false, needs_human_reason: null, archived_at: null, bot_state: started.state });
    await admin.from("audit_log").insert({ actor: actorId, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "whatsapp", missing: missing.map((m) => m.key) } });
    return { ok: true, via: "whatsapp", count: missing.length };
  }

  const templateName = profileDetailsTemplate();
  if (p.ok && p.plan === "template" && templateName && key) {
    const list = oneLine(detailsPhrase(missing));
    const first = oneLine((cand.full_name ?? "").trim().split(/\s+/)[0] || "there");
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com"}/u/${cand.id}`;
    const res = await sendWhatsAppTemplate({ to: key, templateName, bodyParams: [first, list, link] });
    await store.logMessage({
      candidate_id: cand.id,
      direction: "outbound",
      to_phone: key,
      body_preview: renderDetailsMessage(first, list, link),
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: templateName,
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (res.ok) {
      let contact = await store.getContact(key);
      if (!contact) contact = await store.createContact(key);
      await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: cand.id });
      await admin.from("audit_log").insert({ actor: actorId, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "whatsapp_template", template: templateName, missing: missing.map((m) => m.key) } });
      return { ok: true, via: "whatsapp_template", count: missing.length, note: "Sent as an approved WhatsApp template, because the 24-hour window was closed." };
    }
    if (!opts.emailFallback) return { ok: false, error: `WhatsApp didn't send it: ${res.error}` };
    // The template failed (not approved yet, bad number...): fall through to email.
  }

  if (!opts.emailFallback) return { ok: false, skip: p.ok ? undefined : p.skip, error: p.ok ? "Could not send." : p.error };
  return emailFallback(admin, actorId, cand, missing.map((m) => m.ask), missing.map((m) => m.key));
}

async function emailFallback(admin: SupabaseClient, actor: string, cand: CandidateLite, asks: string[], keys: string[]): Promise<AskResult> {
  const reason = "The 24-hour WhatsApp window is closed";
  if (!cand.email || cand.email.endsWith(".invalid")) {
    return { ok: false, skip: "no_email", error: `${reason} and there's no email on file. Message them from your phone, or ask them to message the StaffAnchor number.` };
  }
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return { ok: false, error: `${reason}, and email sending isn't configured.` };
  }
  const list = asks.length > 1 ? `${asks.slice(0, -1).join(", ")} and ${asks[asks.length - 1]}` : asks[0];
  const registerUrl = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(cand.full_name ?? "")}&email=${encodeURIComponent(cand.email)}&ref=${cand.id}`;
  const name = (cand.full_name ?? "").trim().split(/\s+/)[0] || "there";
  try {
    await sendEmail({
      to: cand.email,
      subject: "A few details to complete your StaffAnchor profile",
      text: `Hi ${name},\n\nTo match you with the right roles, we still need ${list}. It takes about a minute: ${registerUrl}\n\nYou can also reply to this email.\n\nThanks,\nStaffAnchor Team`,
      html: renderEmailShell({
        preheader: "A minute to complete your profile so we can match you to the right roles.",
        bodyHtml: `<p>Hi ${name},</p><p>To match you with the right roles, we still need <strong>${list}</strong>. It takes about a minute.</p><p><a href="${registerUrl}">Complete your profile</a></p><p>Thanks,<br/>StaffAnchor Team</p>${whatsappEmailLine("Hi StaffAnchor, I got your email about completing my profile. Could you help?").html}`,
      }),
    });
    await admin.from("audit_log").insert({ actor, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "email", to: cand.email, missing: keys } });
    return { ok: true, via: "email", count: keys.length, note: reason };
  } catch (err) {
    console.error("Missing-details email failed", err);
    return { ok: false, error: "Couldn't send the email. Please try again." };
  }
}
