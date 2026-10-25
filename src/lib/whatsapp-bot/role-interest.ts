// The "Message us on WhatsApp" buttons on the jobs site send a ready-made message:
//   "Hi StaffAnchor, I'm interested in the National Sales Head role in Delhi, Mumbai. Could you tell me more?"
//   "Hi StaffAnchor, I'm Salah Hussain. I just applied for Key Account Manager. Could you update me on the next step?"
// These are not questions for a person to answer; they are interest in a role, and the same reply fits every time.

export type RoleInterest = { role: string; applied: boolean };

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[.,;:!?]+$/g, "").trim().slice(0, 90);

export function roleInterest(text: string | null | undefined): RoleInterest | null {
  const t = (text ?? "").replace(/[‘’]/g, "'");
  if (!t || t.length > 400) return null;
  const applied = t.match(/\b(?:just\s+)?applied\s+(?:for|to)\s+(?:the\s+)?(.+?)(?:\s+role|\s+position)?\s*[.?!]/i);
  if (applied && clean(applied[1]).length >= 3) return { role: clean(applied[1]), applied: true };
  const interested = t.match(/\binterested\s+in\s+(?:the\s+)?(.+?)\s+(?:role|position|opening|vacancy)\b/i);
  if (interested && clean(interested[1]).length >= 3) return { role: clean(interested[1]), applied: false };
  return null;
}
