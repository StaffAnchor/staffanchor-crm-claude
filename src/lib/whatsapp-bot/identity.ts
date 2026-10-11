// Small helpers for working out who a WhatsApp message is from when the phone number alone does not say.

const STOP_WORDS = new Set([
  "i", "im", "am", "is", "and", "from", "here", "just", "applied", "apply", "looking", "want", "wanted", "interested",
  "regarding", "for", "in", "at", "calling", "writing", "sharing", "sending", "sent", "have", "had", "was", "with", "to",
  "hi", "hello", "please", "pls", "kindly", "currently", "working", "a", "an", "the",
]);

/** The full name someone gives when they introduce themselves ("I'm Rishipal singh", "my name is ..."), if it looks like one. */
export function introducedName(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\b(?:i\s*['’]?\s*m|i am|my name is|this is|myself)\s+([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){0,3})/i);
  if (!m) return null;
  const tokens: string[] = [];
  for (const t of m[1].trim().split(/\s+/)) {
    if (STOP_WORDS.has(t.toLowerCase().replace(/['’]/g, ""))) break;
    tokens.push(t);
  }
  // Two or more words, each a real word: one first name alone is far too common to match on.
  if (tokens.length < 2 || tokens.some((t) => t.length < 2)) return null;
  return tokens.join(" ");
}

export function firstEmail(text: string | null | undefined): string | null {
  const m = (text ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** "NEW" (or similar) in answer to "which email did you register with?". */
export const saysNew = (text: string | null | undefined) => /^\s*(new|not registered|no|nope|not yet)\s*[.!]*\s*$/i.test(text ?? "");
