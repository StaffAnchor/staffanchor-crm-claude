import { missingKeyDetails, type KeyDetailCandidate } from "./key-details";

// One function decides what a candidate needs next. The profile screen (verdict, to-do list) and anything else that
// needs to say "what is left for this person" read this, so they can never disagree.

export type Verdict = "ready" | "needs_details" | "on_hold" | "not_a_fit";
export type Fix = "ask_missing" | "get_cv" | "confirm_phone" | "call" | "add_role" | "record_call";

export type NextActionInput = KeyDetailCandidate & {
  phone_hold?: boolean | null;
  phone?: string | null;
  recommendation?: string | null;
  /** Days since the candidate (or a recruiter on a call) last confirmed CTC and notice; null when never. */
  confirmedDaysAgo: number | null;
  activeRoleCount: number;
  callNoteCount: number;
};

export type Todo = { key: string; text: string; impact: string; urgent: boolean; fix: Fix };
export type NextActions = { verdict: Verdict; verdictLabel: string; reason: string; todos: Todo[]; missing: { key: string; label: string; ask: string }[] };

export const STALE_DAYS = 60;

export function candidateNextActions(c: NextActionInput): NextActions {
  const missing = missingKeyDetails(c).filter((m) => m.key !== "resume_file_url");
  const todos: Todo[] = [];

  if (c.phone_hold) todos.push({ key: "phone", text: "Confirm their phone number", impact: "It is on hold, so no WhatsApp or call can go out until it is confirmed.", urgent: true, fix: "confirm_phone" });
  if (missing.length > 0) todos.push({ key: "missing", text: `Get ${missing.map((m) => m.label.toLowerCase()).join(", ")}`, impact: "A profile without these cannot go to a client, and role matching is weaker.", urgent: true, fix: "ask_missing" });
  if (!c.resume_file_url) todos.push({ key: "cv", text: "Get their CV", impact: "The summary, CV facts and role matching are all read from the CV.", urgent: missing.length === 0, fix: "get_cv" });
  const stale = c.confirmedDaysAgo == null || c.confirmedDaysAgo > STALE_DAYS;
  if (stale && missing.length === 0) todos.push({ key: "confirm", text: "Confirm CTC and notice period on a call", impact: c.confirmedDaysAgo == null ? "They have never confirmed their own details. Clients expect verified numbers." : `Last confirmed ${c.confirmedDaysAgo} days ago. Numbers go stale.`, urgent: false, fix: "call" });
  if (c.activeRoleCount === 0) todos.push({ key: "role", text: "Put them on a role", impact: "Not on any role yet, so nothing is moving.", urgent: false, fix: "add_role" });
  if (c.callNoteCount === 0 && !c.recommendation && todos.length === 0) todos.push({ key: "call_note", text: "Record a call note after you speak", impact: "It writes the brief clients see and sharpens future matches.", urgent: false, fix: "record_call" });

  let verdict: Verdict;
  let reason: string;
  if (c.phone_hold) {
    verdict = "on_hold";
    reason = "Phone number is on hold. Confirm it before any message.";
  } else if (c.recommendation === "Not a Fit") {
    verdict = "not_a_fit";
    reason = "A recruiter marked this person as not a fit.";
  } else if (missing.length > 0 || !c.resume_file_url) {
    verdict = "needs_details";
    reason = missing.length > 0 ? `Missing ${missing.slice(0, 3).map((m) => m.label.toLowerCase()).join(", ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.` : "No CV on file.";
  } else if (stale) {
    verdict = "needs_details";
    reason = c.confirmedDaysAgo == null ? "Details have never been confirmed by the candidate." : `Details last confirmed ${c.confirmedDaysAgo} days ago.`;
  } else {
    verdict = "ready";
    reason = c.activeRoleCount > 0 ? `Complete and confirmed. On ${c.activeRoleCount} ${c.activeRoleCount === 1 ? "role" : "roles"}.` : "Complete and confirmed. Not on a role yet.";
  }
  const verdictLabel = { ready: "Ready to put forward", needs_details: "Needs details", on_hold: "On hold", not_a_fit: "Not a fit" }[verdict];
  return { verdict, verdictLabel, reason, todos, missing };
}
