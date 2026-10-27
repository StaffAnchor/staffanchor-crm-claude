import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppFreeform, sendWhatsAppTemplate, profileDetailsTemplate, oneLine } from "@/lib/whatsapp";
import { sendEmail, renderEmailShell } from "@/lib/mail";
import { whatsappEmailLine } from "@/lib/whatsapp-entry";
import { missingKeyDetails } from "@/lib/key-details";
import { startOnboarding, type Step } from "@/lib/whatsapp-bot/flow";
import { candidatePrefill } from "@/lib/whatsapp-bot/engine";
import { supabaseStore, type CandidateLite } from "@/lib/whatsapp-bot/store";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";
import { detailsPhrase, detailsTemplateUsesButton, renderDetailsFreeform, renderDetailsMessage, renderDetailsMessageButton } from "@/lib/whatsapp-template-text";

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
  const missing = askableMissing(cand);
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

// The chat assistant asks these profile details as steps. Leaving a detail out of the ask skips its step.
const STEP_FOR_KEY: Record<string, Step> = {
  current_job_title: "role",
  total_experience_years: "experience",
  current_fixed_ctc: "ctc",
  expected_fixed_ctc: "expected",
  notice_period: "notice",
  current_location: "location",
};

// What to ask first. The message asks for the top few of what THIS person has not given us, in this order,
// and the next ask picks the next ones. Details not named here come after, in their usual order.
const ASK_PRIORITY = [
  "current_fixed_ctc",
  "role_level",
  "notice_period",
  "resume_file_url",
  "current_location",
  "current_employer",
  "open_to_relocation",
  "expected_fixed_ctc",
  "current_job_title",
  "total_experience_years",
];
const ASK_AT_A_TIME = 2;

type Askable = { key: string; label: string; ask: string };

/** Everything this person is missing that we can ask for, most important first. */
function askableMissing(cand: CandidateLite): Askable[] {
  const all: Askable[] = [...missingKeyDetails({ ...cand })];
  if (cand.open_to_relocation === null || cand.open_to_relocation === undefined || String(cand.open_to_relocation).trim() === "") {
    all.push({ key: "open_to_relocation", label: "Relocation preference", ask: "whether you are open to relocating" });
  }
  // Role level is asked only where it is genuinely unclear, second after current CTC.
  if (cand.role_level_unclear) {
    all.push({ key: "role_level", label: "Role level (team size)", ask: "whether you lead a team and how many people" });
  }
  const rank = (k: string) => {
    const i = ASK_PRIORITY.indexOf(k);
    return i === -1 ? ASK_PRIORITY.length : i;
  };
  return all.map((m, idx) => ({ m, idx })).sort((a, b) => rank(a.m.key) - rank(b.m.key) || a.idx - b.idx).map((x) => x.m);
}

/** The details a request will ask for: the ticked ones if the recruiter chose, otherwise the top few. */
function chooseDetails(all: Askable[], only?: string[]): Askable[] {
  return only && only.length > 0 ? all.filter((m) => only.includes(m.key)) : all.slice(0, ASK_AT_A_TIME);
}

/** The chat assistant can ask these one at a time. Anything else goes as a normal message with the profile link. */
const chatCanAsk = (chosen: Askable[]) => chosen.every((m) => m.key in STEP_FOR_KEY || m.key === "resume_file_url");

function skipStepsFor(all: { key: string }[], chosen: { key: string }[]): Step[] {
  const keep = new Set(chosen.map((c) => c.key));
  return all.filter((m) => !keep.has(m.key)).map((m) => STEP_FOR_KEY[m.key]).filter((s): s is Step => !!s);
}

export type AskPreview = {
  route: "chat" | "template" | "email";
  /** The exact message(s) that will go out, for the review step. */
  messages: string[];
  /** Every detail that is missing, and whether it is currently ticked. `fixed` ones are always asked on this route. */
  items: { key: string; label: string; selected: boolean; fixed?: boolean }[];
  note: string;
};

/** What "Ask for missing details" would send to this candidate, without sending anything. */
export async function previewAsk(
  admin: SupabaseClient,
  candidateId: string,
  only?: string[]
): Promise<{ ok: true; preview: AskPreview } | { ok: false; error: string }> {
  const p = await planAsk(admin, candidateId);
  const cand = p.cand;
  if (!cand) return { ok: false, error: p.ok ? "Candidate not found" : p.error };
  const missingAll = askableMissing(cand);
  const chosen = chooseDetails(missingAll, only);
  if (chosen.length === 0) return { ok: false, error: "Pick at least one detail to ask for." };
  const first = oneLine((cand.full_name ?? "").trim().split(/\s+/)[0] || "there");
  const itemList = missingAll.map((m) => ({
      key: m.key,
      label: m.label,
      selected: chosen.some((c) => c.key === m.key),
      fixed: false,
    }));

  const emailable = !!cand.email && !cand.email.endsWith(".invalid");
  if (!p.ok && !(p.skip === "no_template" || p.skip === "no_phone" || p.skip === "recent")) return { ok: false, error: p.error };

  if (p.ok && p.plan === "window") {
    if (!chatCanAsk(chosen)) {
      const list = oneLine(detailsPhrase(chosen));
      const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com"}/u/${cand.id}`;
      return {
        ok: true,
        preview: {
          route: "chat",
          messages: [renderDetailsFreeform(first, list, link)],
          items: itemList,
          note: "Their 24-hour chat is open, so this goes as a normal chat message from StaffAnchor's number: free, with their profile link. (The chat assistant can't ask for everything you ticked, so it sends one message instead of questions.)",
        },
      };
    }
    const started = startOnboarding({
      prefill: candidatePrefill(cand),
      existingCandidateId: cand.id,
      hasResume: !!cand.resume_file_url || !chosen.some((m) => m.key === "resume_file_url"),
      nowIso: new Date().toISOString(),
      recruiterAsked: true,
      skip: skipStepsFor(missingAll, chosen),
    });
    return {
      ok: true,
      preview: {
        route: "chat",
        messages: started.replies,
        items: itemList,
        note: "Their 24-hour chat is open, so this goes as normal chat messages from StaffAnchor's number: free, and the assistant asks only what you ticked and fills their answers into the profile.",
      },
    };
  }
  if (p.ok && p.plan === "template") {
    const list = oneLine(detailsPhrase(chosen));
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com"}/u/${cand.id}`;
    return {
      ok: true,
      preview: {
        route: "template",
        messages: [detailsTemplateUsesButton(profileDetailsTemplate()) ? renderDetailsMessageButton(first, list) : renderDetailsMessage(first, list, link)],
        items: itemList,
        note: "Their 24-hour chat is closed, so this goes as Meta's approved profile-details template. The wording is fixed by Meta; you choose which details it asks for. Meta charges per message.",
      },
    };
  }
  if (emailable) {
    const list = naturalAsk(chosen.map((m) => m.ask));
    return {
      ok: true,
      preview: {
        route: "email",
        messages: [`Subject: A few details to complete your StaffAnchor profile\n\nHi ${first},\n\nTo match you with the right roles, we still need ${list}. It takes about a minute: (a link to complete the profile)\n\nYou can also reply to this email.\n\nThanks,\nStaffAnchor Team`],
        items: itemList,
        note: "WhatsApp can't be used for this person right now, so this goes as an email.",
      },
    };
  }
  return { ok: false, error: p.ok ? "Could not prepare the message." : p.error };
}

const naturalAsk = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

/** Ask one candidate. With `emailFallback`, a closed window with no template falls back to an email. */
export async function askMissingDetails(
  admin: SupabaseClient,
  actorId: string,
  candidateId: string,
  opts: { emailFallback: boolean; /** Ask only for these details (profile keys). Default: everything missing. */ only?: string[] }
): Promise<AskResult> {
  const store = supabaseStore(admin);
  const p = await planAsk(admin, candidateId);
  const cand = p.cand;
  if (!cand) return { ok: false, error: p.ok ? "Candidate not found" : p.error };
  const missingAll = askableMissing(cand);
  const missing = chooseDetails(missingAll, opts.only);
  if (missing.length === 0) return { ok: false, error: "Pick at least one detail to ask for." };
  const skipSteps = skipStepsFor(missingAll, missing);
  const key = phoneKey(cand.phone);
  const nowMs = new Date().getTime();

  // Skips that an email cannot cure are final. A closed window with no template can still use email.
  if (!p.ok && !(opts.emailFallback && (p.skip === "no_template" || p.skip === "no_phone" || p.skip === "recent"))) {
    return { ok: false, skip: p.skip, error: p.error };
  }

  if (p.ok && p.plan === "window" && key && !chatCanAsk(missing)) {
    // Something was ticked that the chat assistant can't ask one question at a time (company, relocation):
    // send it as one normal message with their profile link. Free inside the 24-hour window.
    const first = oneLine((cand.full_name ?? "").trim().split(/\s+/)[0] || "there");
    const link = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com"}/u/${cand.id}`;
    const body = renderDetailsFreeform(first, oneLine(detailsPhrase(missing)), link);
    const res = await sendWhatsAppFreeform({ to: key, body });
    await store.logMessage({
      candidate_id: cand.id,
      direction: "outbound",
      to_phone: key,
      body_preview: body,
      status: res.ok ? "sent" : res.status === "not_configured" ? "not_configured" : "failed",
      template_name: "recruiter:details_request",
      meta_message_id: res.ok ? res.metaMessageId : null,
      error: res.ok ? null : res.error,
    });
    if (!res.ok) return { ok: false, error: `WhatsApp didn't send it: ${res.error}` };
    const contact = (await store.getContact(key)) ?? (await store.createContact(key));
    void contact;
    await store.updateContact(key, { kind: "jobseeker", kind_source: "manual", candidate_id: cand.id });
    await admin.from("audit_log").insert({ actor: actorId, action: "missing_details_asked", entity: "candidate", entity_id: cand.id, detail: { via: "whatsapp_message", missing: missing.map((m) => m.key) } });
    return { ok: true, via: "whatsapp", count: missing.length };
  }

  if (p.ok && p.plan === "window" && key) {
    let contact = await store.getContact(key);
    const started = startOnboarding({
      prefill: candidatePrefill(cand),
      existingCandidateId: cand.id,
      hasResume: !!cand.resume_file_url || !missing.some((m) => m.key === "resume_file_url"),
      nowIso: new Date(nowMs).toISOString(),
      recruiterAsked: true,
      skip: skipSteps,
    });
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
    const withButton = detailsTemplateUsesButton(templateName);
    const res = await sendWhatsAppTemplate(
      withButton ? { to: key, templateName, bodyParams: [first, list], urlButtonParam: cand.id } : { to: key, templateName, bodyParams: [first, list, link] }
    );
    await store.logMessage({
      candidate_id: cand.id,
      direction: "outbound",
      to_phone: key,
      body_preview: withButton ? renderDetailsMessageButton(first, list) : renderDetailsMessage(first, list, link),
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
