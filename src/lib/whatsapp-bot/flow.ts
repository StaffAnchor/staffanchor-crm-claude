import {
  isHuman,
  isRestart,
  isSkip,
  isStop,
  parseCompany,
  isNoCompany,
  parseCtcLakhs,
  parseEmail,
  parseExperienceYears,
  parseLocation,
  parseName,
  parseNoticePeriod,
  parseRoleCompany,
  type CategoryAnswer,
} from "./parse";
import * as T from "./texts";

// The jobseeker profile conversation, as a pure state machine: (state, message) in,
// (new state, replies, things to do) out. No database and no network in here, so every path
// can be tested. The engine around it does the sending and saving.

export type Step = "name" | "role" | "experience" | "ctc" | "expected" | "notice" | "location" | "email" | "company" | "cv" | "done";
export const FIELD_STEPS = ["name", "role", "experience", "ctc", "expected", "notice", "location", "email"] as const;
type FieldStep = (typeof FIELD_STEPS)[number];
const REQUIRED: ReadonlySet<Step> = new Set<Step>(["name", "email"]);

export interface Answers {
  full_name?: string;
  current_job_title?: string;
  current_employer?: string | null;
  total_experience_years?: number;
  category?: CategoryAnswer;
  current_fixed_ctc?: number;
  expected_fixed_ctc?: number;
  notice_period?: string;
  current_location?: string;
  email?: string;
}

export interface PendingCv {
  mediaId: string;
  mimeType: string | null;
  filename: string | null;
}

/** idle: not started. active: asking questions. paused: waiting for a person. saved: profile saved, CV asked. done: finished. */
export type BotStatus = "idle" | "active" | "paused" | "saved" | "done";

export interface BotState {
  status: BotStatus;
  step: Step;
  answers: Answers;
  skipped: Step[];
  retries: number;
  existingCandidateId: string | null;
  candidateId: string | null;
  hasResume: boolean;
  pendingCv: PendingCv | null;
  lastMessageId: string | null;
  startedAt: string | null;
  awaitingMenu: boolean;
  menuSentAt: string | null;
}

export type Effect =
  | { type: "create_candidate"; answers: Answers; skipped: Step[] }
  | { type: "update_candidate"; candidateId: string; answers: Answers }
  | { type: "save_cv"; mediaId: string; mimeType: string | null; filename: string | null }
  | { type: "flag_human"; reason: string }
  | { type: "opt_out" };

export interface Inbound {
  id: string;
  kind: "text" | "document" | "other";
  text?: string | null;
  mediaId?: string | null;
  mimeType?: string | null;
  filename?: string | null;
}

export interface StepResult {
  state: BotState;
  replies: string[];
  effects: Effect[];
}

export const emptyState = (): BotState => ({
  status: "idle",
  step: "name",
  answers: {},
  skipped: [],
  retries: 0,
  existingCandidateId: null,
  candidateId: null,
  hasResume: false,
  pendingCv: null,
  lastMessageId: null,
  startedAt: null,
  awaitingMenu: false,
  menuSentAt: null,
});

const answered = (a: Answers, s: FieldStep): boolean => {
  switch (s) {
    case "name": return !!a.full_name;
    case "role": return !!a.current_job_title;
    case "experience": return a.total_experience_years !== undefined;
    case "ctc": return a.current_fixed_ctc !== undefined;
    case "expected": return a.expected_fixed_ctc !== undefined;
    case "notice": return !!a.notice_period;
    case "location": return !!a.current_location;
    case "email": return !!a.email;
  }
};

const nextFieldStep = (s: BotState): FieldStep | null => FIELD_STEPS.find((f) => !answered(s.answers, f) && !s.skipped.includes(f)) ?? null;
const first = (s: BotState) => T.firstName(s.answers.full_name);
const question = (s: BotState, step: Step): string => (T.QUESTION[step] ? T.QUESTION[step](first(s)) : "");

const isCvFile = (m: Inbound): boolean => {
  const mime = (m.mimeType ?? "").toLowerCase();
  const name = (m.filename ?? "").toLowerCase();
  return /pdf|msword|wordprocessingml/.test(mime) || /\.(pdf|docx?|rtf)$/.test(name) || (m.kind === "document" && !mime && !name);
};

const looksLikeAnotherQuery = (text: string) => text.length >= 100 || text.includes("?");

/** Start asking questions. `prefill` is what we already know about someone with an incomplete profile. */
export function startOnboarding(opts: { prefill?: Answers; existingCandidateId?: string | null; hasResume?: boolean; nowIso: string }): StepResult {
  const state: BotState = {
    ...emptyState(),
    status: "active",
    answers: { ...(opts.prefill ?? {}) },
    existingCandidateId: opts.existingCandidateId ?? null,
    hasResume: !!opts.hasResume,
    startedAt: opts.nowIso,
  };
  const intro = opts.existingCandidateId
    ? `Hi ${first(state)}! We found your StaffAnchor profile, but a few details are missing. I'll ask a few quick questions (about a minute). Reply SKIP to pass on one, or STOP at any time.`
    : T.INTRO;
  const result: StepResult = { state, replies: [intro], effects: [] };
  return moveOn(result);
}

/** Ask the next question, or save the profile and ask for the CV once every answer is in. */
function moveOn(r: StepResult): StepResult {
  const s = r.state;
  const next = nextFieldStep(s);
  if (next) {
    s.step = next;
    r.replies.push(question(s, next));
    return r;
  }
  // Every answer is in (or skipped). An email is needed to create a profile; without one a person finishes it.
  if (!s.answers.email && !s.existingCandidateId) {
    r.effects.push({ type: "flag_human", reason: "Details collected on WhatsApp but no email, so the profile needs creating by hand" });
    r.replies.push(T.DONE_NEEDS_RECRUITER(first(s)));
    s.status = "paused";
    s.step = "done";
    return r;
  }
  if (s.existingCandidateId) r.effects.push({ type: "update_candidate", candidateId: s.existingCandidateId, answers: s.answers });
  else r.effects.push({ type: "create_candidate", answers: s.answers, skipped: s.skipped });

  if (s.pendingCv) {
    r.effects.push({ type: "save_cv", ...s.pendingCv });
    s.pendingCv = null;
    return finish(r, [T.SAVED(first(s))]);
  }
  if (s.hasResume) return finish(r, [T.SAVED(first(s))]);
  s.status = "saved";
  s.step = "cv";
  r.replies.push(T.SAVED(first(s)), question(s, "cv"));
  return r;
}

/** Once a profile is saved and the CV has been read: if we still don't know their company, ask. */
export function askCompany(prev: BotState): StepResult {
  const state: BotState = { ...prev, answers: { ...prev.answers }, skipped: [...prev.skipped], status: "active", step: "company", retries: 0 };
  return { state, replies: [question(state, "company")], effects: [] };
}

function finish(r: StepResult, lead: string[] = []): StepResult {
  r.state.status = "done";
  r.state.step = "done";
  r.replies.push(...lead, T.DONE(first(r.state)));
  return r;
}

function pause(r: StepResult, reason: string, reply: string): StepResult {
  r.state.status = "paused";
  r.effects.push({ type: "flag_human", reason });
  r.replies.push(reply);
  return r;
}

/** Handle one incoming message while a conversation is in progress (or paused, saved, or done). */
export function step(prev: BotState, m: Inbound): StepResult {
  // Meta can deliver the same message twice; the second time changes nothing.
  if (prev.lastMessageId === m.id) return { state: prev, replies: [], effects: [] };
  const state: BotState = { ...prev, answers: { ...prev.answers }, skipped: [...prev.skipped], lastMessageId: m.id };
  const r: StepResult = { state, replies: [], effects: [] };
  const text = (m.text ?? "").trim();

  // Words that always mean the same thing, wherever we are.
  if (m.kind === "text") {
    if (isStop(text)) {
      state.status = "done";
      r.effects.push({ type: "opt_out" });
      r.replies.push(T.STOP_ACK);
      return r;
    }
    if (state.status === "paused") {
      // Only "profile" brings the assistant back after a person was asked to step in.
      if (isRestart(text) && state.step !== "done") {
        state.status = "active";
        state.retries = 0;
        r.replies.push(T.WELCOME_BACK, question(state, state.step === "cv" ? "cv" : state.step));
        return r;
      }
      return r; // silence: a person is handling this
    }
    if (isHuman(text)) return pause(r, "Asked to talk to a recruiter", T.HUMAN_ACK);
    if (state.status === "active" && isRestart(text)) {
      if (/^(restart|start over)/i.test(text)) {
        const fresh = startOnboarding({ existingCandidateId: state.existingCandidateId, hasResume: state.hasResume, nowIso: state.startedAt ?? new Date().toISOString() });
        fresh.state.lastMessageId = m.id;
        fresh.replies.unshift(T.RESTARTED);
        return fresh;
      }
      r.replies.push(question(state, state.step));
      return r;
    }
  }

  if (state.status === "done" || state.status === "idle") return r; // nothing to ask; a person handles anything else
  if (state.status === "paused") return r;

  // A file can arrive at any point. A CV is kept and attached; anything else gets a gentle nudge.
  if (m.kind === "document") {
    if (!isCvFile(m) || !m.mediaId) {
      r.replies.push(T.CV_WRONG_TYPE);
      return r;
    }
    if (state.status === "saved") {
      r.effects.push({ type: "save_cv", mediaId: m.mediaId, mimeType: m.mimeType ?? null, filename: m.filename ?? null });
      return finish(r, [T.CV_THANKS]);
    }
    if (state.step === "company") {
      r.effects.push({ type: "save_cv", mediaId: m.mediaId, mimeType: m.mimeType ?? null, filename: m.filename ?? null });
      r.replies.push(T.CV_THANKS, question(state, "company"));
      return r;
    }
    state.pendingCv = { mediaId: m.mediaId, mimeType: m.mimeType ?? null, filename: m.filename ?? null };
    r.replies.push(T.CV_THANKS, question(state, state.step));
    return r;
  }

  if (m.kind === "other") {
    state.retries += 1;
    if (state.retries >= 3) return pause(r, "Kept sending messages the assistant can't read", T.HUMAN_ACK);
    r.replies.push(`${T.NON_TEXT} ${question(state, state.step)}`);
    return r;
  }

  // The CV question.
  if (state.status === "saved") {
    if (!isSkip(text) && looksLikeAnotherQuery(text)) return pause(r, "Sent a message instead of a CV", T.DIFFERENT_QUERY_ACK);
    return finish(r);
  }

  // The company question, asked after the CV was read and no current employer could be found.
  if (state.step === "company") {
    const cid = state.candidateId ?? state.existingCandidateId;
    if (isSkip(text) || isNoCompany(text)) return finish(r);
    const company = parseCompany(text);
    if (company) {
      state.answers.current_employer = company;
      if (cid) r.effects.push({ type: "update_candidate", candidateId: cid, answers: { current_employer: company } });
      return finish(r);
    }
    if (looksLikeAnotherQuery(text)) return pause(r, "Asked something else when asked for current company", T.DIFFERENT_QUERY_ACK);
    state.retries += 1;
    if (state.retries === 1) {
      r.replies.push(`${T.HINT.company} ${question(state, "company")}`);
      return r;
    }
    return finish(r); // two tries is enough; a recruiter can fill it in
  }

  // A normal answer to the current question.
  const stepNow = state.step as FieldStep;
  if (isSkip(text)) {
    if (REQUIRED.has(stepNow)) {
      r.replies.push(`${T.NEEDED} ${question(state, stepNow)}`);
      return r;
    }
    state.skipped.push(stepNow);
    state.retries = 0;
    r.replies.push(T.SKIPPED);
    return moveOn(r);
  }

  if (applyAnswer(state, stepNow, text)) {
    state.retries = 0;
    return moveOn(r);
  }

  // Could not read it.
  if (looksLikeAnotherQuery(text)) return pause(r, "Asked something else during profile setup", T.DIFFERENT_QUERY_ACK);
  state.retries += 1;
  if (state.retries === 1) {
    r.replies.push(`${T.HINT[stepNow]} ${question(state, stepNow)}`.trim());
    return r;
  }
  if (REQUIRED.has(stepNow)) return pause(r, `Could not read the ${stepNow} after two tries`, T.DIFFERENT_QUERY_ACK);
  state.skipped.push(stepNow);
  state.retries = 0;
  r.replies.push(T.SKIPPED);
  return moveOn(r);
}

function applyAnswer(s: BotState, st: FieldStep, text: string): boolean {
  const a = s.answers;
  switch (st) {
    case "name": {
      const v = parseName(text);
      if (!v) return false;
      a.full_name = v;
      return true;
    }
    case "role": {
      const v = parseRoleCompany(text);
      if (!v) return false;
      a.current_job_title = v.title;
      a.current_employer = v.company;
      return true;
    }
    case "experience": {
      const v = parseExperienceYears(text);
      if (v == null) return false;
      a.total_experience_years = v;
      return true;
    }
    case "ctc": {
      const v = parseCtcLakhs(text, { allowZero: true });
      if (v == null) return false;
      a.current_fixed_ctc = v;
      return true;
    }
    case "expected": {
      const v = parseCtcLakhs(text);
      if (v == null) return false;
      a.expected_fixed_ctc = v;
      return true;
    }
    case "notice": {
      const v = parseNoticePeriod(text);
      if (!v) return false;
      a.notice_period = v;
      return true;
    }
    case "location": {
      const v = parseLocation(text);
      if (!v) return false;
      a.current_location = v;
      return true;
    }
    case "email": {
      const v = parseEmail(text);
      if (!v) return false;
      a.email = v;
      return true;
    }
  }
}
