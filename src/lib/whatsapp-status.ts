import { WINDOW_MS, type WaConversation } from "@/lib/whatsapp-threads";

// What a WhatsApp conversation is waiting for, in one word, so the page can be organised by "what do I do?" instead of
// by who the person is. Every conversation is in exactly one state.
export type WaState = "needs_you" | "can_wait" | "assistant" | "waiting" | "failed" | "archived";

export type WaContactLite = {
  kind: string;
  archived: boolean;
  muted: boolean;
  botPaused: boolean;
  needsHuman: boolean;
  reason: string | null;
  optedOut: boolean;
  botStatus: string | null;
  botStep: string | null;
};

export type WaStatus = {
  state: WaState;
  /** The one line shown under the name: why this chat is where it is. */
  why: string;
  /** How long the thing has been waiting, in ms, for sorting and urgency. */
  waitingMs: number;
  /** "ok", "soon" (worth doing now) or "late" (overdue). */
  urgency: "ok" | "soon" | "late";
  /** Hours left to reply for free, when the reply window is open. */
  windowHoursLeft: number | null;
  /** What we last sent, in plain words, when it was a template or the assistant. */
  lastSent: string | null;
};

const SENT_LABEL: [RegExp, string][] = [
  [/role_nudge/i, "Reminder about a role"],
  [/role_opportunity|opportunity_intro/i, "Told about a role"],
  [/referral_role/i, "Asked to refer someone for a role"],
  [/referral/i, "Asked for a referral"],
  [/reactivation|still_open/i, "Asked if they are open to roles"],
  [/profile_details/i, "Asked for missing details"],
  [/interview/i, "Interview request"],
  [/offer/i, "Offer follow-up"],
  [/^bot:/i, "Assistant message"],
];

export const sentLabel = (template: string | null | undefined): string | null => {
  if (!template) return null;
  return SENT_LABEL.find(([re]) => re.test(template))?.[1] ?? "Template message";
};

export function ago(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

const clip = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// `urgentKeys` is the one definition of "reply now" (employers, candidates on a live role, questions the assistant could
// not answer: see waiting-queue.ts). A chat where a person could reply but nobody has to, such as a candidate who only got
// the automatic acknowledgement, is "can_wait" rather than "needs_you". Leave it undefined to keep the old behaviour.
export function statusOf(c: WaConversation, info: WaContactLite | undefined, now: number, urgentKeys?: Set<string>): WaStatus {
  const last = c.messages[c.messages.length - 1];
  const sinceLast = Math.max(0, now - new Date(last.created_at).getTime());
  const windowLeft = c.lastInboundAt ? WINDOW_MS - (now - new Date(c.lastInboundAt).getTime()) : 0;
  const windowHoursLeft = windowLeft > 0 ? Math.max(1, Math.floor(windowLeft / 3_600_000)) : null;
  const lastOut = [...c.messages].reverse().find((m) => m.direction === "outbound");
  const lastSent = sentLabel(lastOut?.template_name) ?? null;
  const base = { windowHoursLeft, lastSent };
  const urgencyFor = (ms: number): WaStatus["urgency"] => (ms > 24 * 3_600_000 ? "late" : ms > 4 * 3_600_000 ? "soon" : "ok");

  if (info?.archived) return { state: "archived", why: "Archived", waitingMs: sinceLast, urgency: "ok", ...base };

  // A person owes a reply: they wrote last, or the assistant handed the chat over (for example they tapped "Yes").
  if (info?.needsHuman || c.needsReply) {
    const handed = info?.needsHuman && info.reason;
    const body = last.direction === "inbound" ? (last.body_preview ?? "").trim() : "";
    const why = handed ? (info!.reason as string) : body ? `They wrote: ${clip(body)}` : "They replied";
    if (urgentKeys && !urgentKeys.has(c.key)) return { state: "can_wait", why, waitingMs: sinceLast, urgency: "ok", ...base };
    return { state: "needs_you", why, waitingMs: sinceLast, urgency: urgencyFor(sinceLast), ...base };
  }

  // The last thing we sent could not be delivered.
  if (last.direction === "outbound" && last.status === "failed") {
    return { state: "failed", why: `Not delivered${last.error ? `: ${clip(last.error, 60)}` : ""}`, waitingMs: sinceLast, urgency: "soon", ...base };
  }

  // The assistant is mid-conversation, collecting a profile, and nothing needs a person.
  if (info?.botStatus === "active" && !info.botPaused && !info.optedOut) {
    return { state: "assistant", why: `Assistant is collecting their profile${info.botStep ? ` (${info.botStep})` : ""}`, waitingMs: sinceLast, urgency: "ok", ...base };
  }

  // We sent last and they have not answered.
  const what = lastSent ?? "Message sent";
  const optedOut = info?.optedOut ? " · opted out of automatic messages" : "";
  return { state: "waiting", why: `${what} · no reply for ${ago(sinceLast)}${optedOut}`, waitingMs: sinceLast, urgency: "ok", ...base };
}

export const STATE_META: Record<WaState, { label: string; blurb: string; tone: string }> = {
  needs_you: { label: "Reply now", blurb: "Employers, candidates on a live role, and questions the assistant could not answer.", tone: "rose" },
  can_wait: { label: "Can wait", blurb: "Candidates who wrote in and got the automatic reply. Nobody has to answer them, but you can.", tone: "slate" },
  assistant: { label: "Assistant working", blurb: "The assistant is collecting details. Nothing for you to do unless it hands over.", tone: "teal" },
  waiting: { label: "Waiting on them", blurb: "We sent a message and they haven't answered yet.", tone: "slate" },
  failed: { label: "Not delivered", blurb: "A message didn't reach the person. Check the number.", tone: "amber" },
  archived: { label: "Archived", blurb: "Put away.", tone: "slate" },
};
