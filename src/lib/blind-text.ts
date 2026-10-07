// Referrers must never learn the client company's name from a role write-up.
// These helpers find it (case-insensitive, as a whole word) and mask it.

const escape = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words in a company name worth matching on their own ("Acme" from "Acme Corp Pvt Ltd"). */
function nameTokens(clientName: string): string[] {
  const full = clientName.trim();
  const generic = new Set(["pvt", "ltd", "private", "limited", "llp", "inc", "corp", "corporation", "technologies", "technology", "solutions", "services", "india", "group", "the", "and", "company", "co"]);
  const tokens = full
    .split(/[^A-Za-z0-9&]+/)
    .filter((t) => t.length >= 4 && !generic.has(t.toLowerCase()));
  return Array.from(new Set([full, ...tokens].filter((t) => t.length >= 3)));
}

export function mentionsClientName(text: string, clientName: string | null | undefined): boolean {
  if (!clientName || !text) return false;
  return nameTokens(clientName).some((t) => new RegExp(`\\b${escape(t)}\\b`, "i").test(text));
}

export function maskClientName(text: string, clientName: string | null | undefined): string {
  if (!clientName || !text) return text;
  let out = text;
  for (const t of nameTokens(clientName).sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(`\\b${escape(t)}\\b`, "gi"), "the company");
  }
  return out;
}
