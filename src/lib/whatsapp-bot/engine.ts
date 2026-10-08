import { classifyText, parseMenuChoice, type ContactKind } from "./classify";
import { askCompany, emptyState, startOnboarding, step, type Answers, type BotState, type Effect, type Inbound, type StepResult } from "./flow";
import { isMenu, isStop } from "./parse";
import * as T from "./texts";
import type { CandidateLite, Contact, Store } from "./store";

// The rules for every WhatsApp message that comes in.
//
//  - Work out who this is: a candidate, a client contact or a referrer in our records counts for
//    more than what they typed; a recruiter's label or their 1/2/3 answer counts for more still.
//  - The profile questions are asked ONLY of jobseekers. Employers, referrers and "other" get a
//    short acknowledgement and are handed to a person, so a hiring manager is never asked for a CTC.
//  - The assistant never speaks first, never after STOP, never once a recruiter has replied, and
//    never to a chat that is archived and muted.
//  - Every decision is saved, and every message it sends is recorded.

export interface Io {
  send(toDigits: string, body: string): Promise<{ ok: true; id: string } | { ok: false; error: string; notConfigured?: boolean }>;
  downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; mime: string | null } | null>;
}

export interface EngineEnv {
  /** Master switch for the assistant. Off by default. */
  enabled: boolean;
  /** When set, the assistant only talks to these numbers (last 10 digits): used to test on your own phone. */
  allowlist: string[] | null;
  /** Our own team's numbers (last 10 digits): recorded, never answered. */
  staff?: string[];
  nowMs: number;
}

export interface InboundMessage {
  phone: string; // as Meta sends it, digits with country code
  id: string;
  type: string;
  text: string | null;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
}

export type Outcome = { action: string; kind: ContactKind; replies: string[] };

export const phoneKey = (p: string | null | undefined): string | null => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
};

const DAY = 24 * 60 * 60 * 1000;
const MAX_BOT_MESSAGES_PER_MINUTE = 15;
const REGISTERED_STATUS = (s: string) => !["lead", "awaiting_input"].includes(s);

const asFlowInbound = (m: InboundMessage): Inbound => {
  if (m.type === "document") return { id: m.id, kind: "document", mediaId: m.mediaId, mimeType: m.mimeType, filename: m.filename };
  if (m.text !== null && (m.type === "text" || m.type === "button" || m.type === "interactive")) return { id: m.id, kind: "text", text: m.text };
  return { id: m.id, kind: "other" };
};

/** India numbers are kept as 10 digits, like the rest of the candidate database; others keep their country code. */
const storedPhone = (digits: string) => (digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : `+${digits}`);

export async function handleInbound(env: EngineEnv, store: Store, io: Io, m: InboundMessage): Promise<Outcome> {
  const key = phoneKey(m.phone);
  if (!key) return { action: "ignored", kind: "unsorted", replies: [] };
  const now = new Date(env.nowMs).toISOString();

  const contact: Contact = (await store.getContact(key)) ?? (await store.createContact(key));
  const patch: Partial<Omit<Contact, "phone_key" | "bot_version">> = {};

  // Our own team is never answered by the assistant.
  if (env.staff?.includes(key)) {
    if (contact.kind !== "other" || contact.kind_source !== "manual") await store.updateContact(key, { kind: "other", kind_source: "manual", bot_paused: true });
    return { action: "staff", kind: "other", replies: [] };
  }

  // A muted, archived chat is left alone. An archived chat that is not muted comes back.
  if (contact.archived_at) {
    if (contact.muted) return { action: "muted", kind: contact.kind, replies: [] };
    patch.archived_at = null;
  }

  // Who is this?
  const identity = await store.lookupIdentity(key);
  let kind = contact.kind;
  let source = contact.kind_source;
  if (source !== "manual" && source !== "menu") {
    const byIdentity: ContactKind | null = identity.employer ? "employer" : identity.referrer ? "referrer" : identity.candidate ? "jobseeker" : null;
    if (byIdentity) {
      kind = byIdentity;
      source = "identity";
    } else {
      const byText = classifyText(m.text);
      if (byText && (kind === "unsorted" || source === "text")) {
        kind = byText;
        source = "text";
      }
    }
  }
  if (kind !== contact.kind) patch.kind = kind;
  if (source !== contact.kind_source) patch.kind_source = source;
  if (identity.candidate) {
    if (contact.candidate_id !== identity.candidate.id) patch.candidate_id = identity.candidate.id;
    if (!contact.display_name && identity.candidate.full_name) patch.display_name = identity.candidate.full_name;
  }

  const wantsStop = (m.type === "text" || m.type === "button") && m.text !== null && isStop(m.text);
  if (wantsStop) patch.opted_out = true;

  // May the assistant speak at all?
  // A recruiter who asks for someone's missing details has chosen that chat, so the assistant may carry on there.
  const botState = contact.bot_state as Partial<BotState>;
  const recruiterAsked = botState.recruiterStarted === true && (botState.status === "active" || botState.status === "saved");
  const allowed = env.enabled && (!env.allowlist || env.allowlist.includes(key) || recruiterAsked);
  const isFile = (m.type === "document" || m.type === "image") && !!m.mediaId;

  // Keep every file people send us (a CV, a job description) so a recruiter can open it from the chat,
  // whether or not the assistant is switched on for this number.
  if (isFile) await keepAttachment(store, io, key, m);
  if (!allowed || contact.opted_out || contact.bot_paused) {
    if (Object.keys(patch).length) await store.updateContact(key, patch);
    return { action: allowed ? "silent" : "recorded", kind, replies: [] };
  }

  // A loop guard: never more than a handful of automatic messages in a minute.
  const recentBot = await store.countBotMessagesSince(key, new Date(env.nowMs - 60 * 1000).toISOString());
  if (recentBot >= MAX_BOT_MESSAGES_PER_MINUTE) {
    await store.updateContact(key, { ...patch, needs_human: true, needs_human_reason: "Too many automatic messages in a minute", bot_paused: true });
    return { action: "loop_guard", kind, replies: [] };
  }

  const prev: BotState = { ...emptyState(), ...(contact.bot_state as Partial<BotState>) };
  let state: BotState = { ...prev, answers: { ...(prev.answers ?? {}) }, skipped: [...(prev.skipped ?? [])] };
  let replies: string[] = [];
  let effects: Effect[] = [];
  let flow = "onboarding";
  let action = "reply";

  const hand = (reason: string) => {
    patch.needs_human = true;
    patch.needs_human_reason = reason;
  };
  const ackOnce = async (text: string, reason: string) => {
    flow = "ack";
    const talked = await store.hasOutboundSince(key, new Date(env.nowMs - DAY).toISOString());
    hand(reason);
    if (!talked) replies = [text];
    else action = "silent";
  };

  // An employer who sends a job description (a file, or a long message) gets a "received" note,
  // once a day, instead of being asked again what they are hiring for.
  const employerReply = async () => {
    const isJd = isFile || (m.text ?? "").trim().length >= 120;
    if (!isJd) return ackOnce(T.EMPLOYER_ACK, "Employer enquiry");
    flow = "jd";
    hand("Employer sent a job description");
    const already = await store.countBotMessagesSince(key, new Date(env.nowMs - DAY).toISOString(), "bot:jd");
    if (already === 0) replies = [T.JD_ACK];
    else action = "silent";
  };

  const startJobseeker = () => {
    const c = identity.candidate;
    const prefill = c ? candidatePrefill(c) : {};
    const started: StepResult = startOnboarding({ prefill, existingCandidateId: c?.id ?? null, hasResume: !!c?.resume_file_url, nowIso: now });
    started.state.lastMessageId = m.id;
    state = started.state;
    replies = started.replies;
    effects = started.effects;
  };

  if ((m.type === "text" || m.type === "button") && m.text !== null && isMenu(m.text)) {
    // "Wrong option": start again from the menu, whoever we thought they were.
    kind = "unsorted";
    patch.kind = "unsorted";
    patch.kind_source = "manual";
    patch.needs_human = false;
    patch.needs_human_reason = null;
    state = { ...emptyState(), awaitingMenu: true, menuSentAt: now };
    flow = "menu";
    replies = [T.MENU];
  } else if (kind === "unsorted") {
    flow = "menu";
    const choice = state.awaitingMenu ? parseMenuChoice(m.text) : null;
    if (choice) {
      kind = choice;
      patch.kind = choice;
      patch.kind_source = "menu";
      state.awaitingMenu = false;
      if (choice === "jobseeker") {
        if (identity.candidate && REGISTERED_STATUS(identity.candidate.status)) {
          await ackOnce(T.KNOWN_ACK(T.firstName(identity.candidate.full_name)), "Registered candidate messaged");
        } else startJobseeker();
        flow = "onboarding";
      } else if (choice === "employer") await employerReply();
      else await ackOnce(T.OTHER_ACK, "Other enquiry");
    } else if (state.awaitingMenu) {
      state.retries += 1;
      if (state.retries >= 2) {
        hand("Did not choose from the menu");
        action = "silent";
      } else replies = [T.MENU_REMINDER];
    } else {
      state.awaitingMenu = true;
      state.menuSentAt = now;
      state.retries = 0;
      replies = [T.MENU];
    }
  } else if (kind === "jobseeker") {
    if (identity.candidate && REGISTERED_STATUS(identity.candidate.status)) {
      await ackOnce(T.KNOWN_ACK(T.firstName(identity.candidate.full_name)), "Registered candidate messaged");
    } else if (state.status === "idle") {
      startJobseeker();
    } else {
      const r = step(state, asFlowInbound(m));
      state = r.state;
      replies = r.replies;
      effects = r.effects;
    }
  } else if (kind === "employer") {
    await employerReply();
  } else if (kind === "referrer") {
    await ackOnce(T.REFERRER_ACK, "Referrer message");
  } else {
    await ackOnce(T.OTHER_ACK, "Other enquiry");
  }

  // Do what the conversation decided (save the profile, keep the CV, flag a person).
  const phoneForProfile = storedPhone(m.phone.replace(/\D/g, ""));
  for (const e of effects) {
    if (e.type === "flag_human") hand(e.reason);
    else if (e.type === "opt_out") patch.opted_out = true;
    else if (e.type === "update_candidate") await store.fillCandidate(e.candidateId, e.answers, phoneForProfile);
    else if (e.type === "create_candidate") {
      const dup = e.answers.email ? await store.findCandidateByEmail(e.answers.email) : null;
      if (dup) {
        // This person is already in the database under that email: link the number, never create a second profile.
        await store.fillCandidate(dup.id, e.answers, phoneForProfile);
        state.candidateId = dup.id;
        patch.candidate_id = dup.id;
        const n = T.firstName(e.answers.full_name ?? dup.full_name);
        replies = [T.LINKED_EXISTING(n)];
        state.status = "done";
        state.step = "done";
      } else {
        const created = await store.createCandidate(e.answers, phoneForProfile);
        if ("error" in created) {
          hand(`Could not save the profile from WhatsApp: ${created.error}`);
          replies = [T.DONE_NEEDS_RECRUITER(T.firstName(e.answers.full_name))];
          state.status = "paused";
          state.step = "done";
        } else {
          state.candidateId = created.id;
          patch.candidate_id = created.id;
          if (e.answers.full_name) patch.display_name = e.answers.full_name;
        }
      }
    } else if (e.type === "save_cv") {
      const target = state.candidateId ?? state.existingCandidateId ?? patch.candidate_id ?? contact.candidate_id;
      const ok = target ? await saveCv(store, io, target, e.mediaId, e.mimeType, e.filename) : false;
      if (!ok) {
        // Do not claim it was attached. Ask again, and stay on the CV step.
        replies = replies.filter((r) => r !== T.CV_THANKS && r !== T.DONE(T.firstName(state.answers.full_name)));
        replies.push(T.CV_RETRY);
        state.status = "saved";
        state.step = "cv";
      }
    }
  }
  if (state.existingCandidateId && !state.candidateId) state.candidateId = state.existingCandidateId;

  // The profile is complete. Read the CV to fill what the chat did not cover (company, selling type),
  // and if we still do not know where they work, ask once rather than guess.
  const justFinished = flow === "onboarding" && prev.status !== "done" && prev.step !== "company" && state.status === "done" && replies.some((r) => r.startsWith(T.DONE_PREFIX));
  if (justFinished && state.candidateId) {
    const before = await store.getCandidate(state.candidateId);
    if (before?.resume_file_url) {
      const { cvEmployer } = await store.enrichFromCv(state.candidateId);
      const said = (before.current_employer ?? "").trim().toLowerCase();
      const cv = (cvEmployer ?? "").trim().toLowerCase();
      if (said && cv && !said.includes(cv) && !cv.includes(said)) hand(`CV shows current company "${cvEmployer}" but the candidate said "${before.current_employer}"`);
    }
    const after = await store.getCandidate(state.candidateId);
    if (after && !(after.current_employer ?? "").trim()) {
      const ask = askCompany(state);
      state = ask.state;
      replies = replies.filter((r) => !r.startsWith(T.DONE_PREFIX)).concat(ask.replies);
    }
  }

  // Send, then remember. If the first message cannot be sent, the conversation does not move on.
  let allSent = true;
  for (const text of replies) {
    const res = await io.send(m.phone.replace(/\D/g, ""), text);
    await store.logMessage({
      candidate_id: state.candidateId ?? contact.candidate_id ?? null,
      direction: "outbound",
      to_phone: m.phone.replace(/\D/g, ""),
      body_preview: text,
      status: res.ok ? "sent" : res.notConfigured ? "not_configured" : "failed",
      template_name: `bot:${flow}`,
      meta_message_id: res.ok ? res.id : null,
      error: res.ok ? null : res.error,
    });
    if (!res.ok) {
      allSent = false;
      break;
    }
  }
  if (!allSent) {
    if (Object.keys(patch).length) await store.updateContact(key, patch);
    return { action: "send_failed", kind, replies };
  }

  const applied = await store.updateContact(key, { ...patch, bot_state: state }, contact.bot_version);
  return { action: applied ? action : "conflict", kind, replies };
}

async function saveCv(store: Store, io: Io, candidateId: string, mediaId: string, mime: string | null, filename: string | null): Promise<boolean> {
  try {
    const media = await io.downloadMedia(mediaId);
    if (!media || media.bytes.byteLength === 0 || media.bytes.byteLength > 10 * 1024 * 1024) return false;
    const base = (filename ?? "cv").normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
    const ext = /\.(pdf|docx?|rtf)$/i.test(base) ? "" : /pdf/i.test(media.mime ?? mime ?? "") ? ".pdf" : /word/i.test(media.mime ?? mime ?? "") ? ".docx" : "";
    const path = `${crypto.randomUUID()}-${base}${ext}`;
    const err = await store.uploadResume(path, media.bytes, media.mime ?? mime);
    if (err) return false;
    await store.setCandidateResume(candidateId, path);
    return true;
  } catch {
    return false;
  }
}

async function keepAttachment(store: Store, io: Io, key: string, m: InboundMessage): Promise<void> {
  try {
    const media = await io.downloadMedia(m.mediaId as string);
    if (!media || media.bytes.byteLength === 0 || media.bytes.byteLength > 15 * 1024 * 1024) return;
    const mime = media.mime ?? m.mimeType;
    const base = (m.filename ?? (m.type === "image" ? "photo" : "file")).normalize("NFKD").replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
    const ext = /\.[A-Za-z0-9]{2,5}$/.test(base) ? "" : /pdf/i.test(mime ?? "") ? ".pdf" : /word/i.test(mime ?? "") ? ".docx" : /png/i.test(mime ?? "") ? ".png" : /jpe?g/i.test(mime ?? "") ? ".jpg" : "";
    await store.saveAttachment(m.id, `whatsapp/${key}/${crypto.randomUUID()}-${base}${ext}`, media.bytes, m.filename ?? base, mime ?? null);
  } catch {
    // Best effort: the message is still in the chat.
  }
}

/** What we already know about a candidate, in the shape the profile conversation reads. */
export function candidatePrefill(c: CandidateLite): Answers {
  return {
    ...(c.full_name ? { full_name: c.full_name } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.current_job_title ? { current_job_title: c.current_job_title } : {}),
    current_employer: c.current_employer ?? null,
    ...(c.total_experience_years != null ? { total_experience_years: Number(c.total_experience_years) } : {}),
    ...(c.category ? { category: c.category as "b2b_sales" | "b2c_sales" | "non_sales" } : {}),
    ...(c.current_fixed_ctc != null ? { current_fixed_ctc: Number(c.current_fixed_ctc) } : {}),
    ...(c.expected_fixed_ctc != null ? { expected_fixed_ctc: Number(c.expected_fixed_ctc) } : {}),
    ...(c.notice_period ? { notice_period: c.notice_period } : {}),
    ...(c.current_location ? { current_location: c.current_location } : {}),
  };
}
