// Anchor, the CRM assistant for everyone on the platform. The common asks (placements, fees, "take me to...") are answered
// straight from the database with fixed rules, so they are instant, exact and cost nothing. Anything open-ended goes to the
// AI assistant, and only for admins. This file only reads the words; it never touches data.

export type Range = 30 | 60 | 90 | "life";

export type Intent =
  | { kind: "placements"; range: Range }
  | { kind: "fees"; range: Range }
  | { kind: "dropped" }
  | { kind: "go"; q: string; type: "mandate" | "candidate" | "client" | null; explicit: boolean }
  | { kind: "agent" };

export const RANGE_LABEL: Record<string, string> = { "30": "last 30 days", "60": "last 60 days", "90": "last 90 days", life: "all time" };

export function parseRange(text: string): Range {
  const t = text.toLowerCase();
  if (/\b(life ?time|all[- ]time|ever|overall|since (the )?start|since we started|till date|to date)\b/.test(t)) return "life";
  if (/\b(90|ninety|3 months|three months|quarter)\b/.test(t)) return 90;
  if (/\b(60|sixty|2 months|two months)\b/.test(t)) return 60;
  return 30;
}

const WH = /^(who|what|which|how|why|when|where|can|could|should|would|is|are|do|does|did|draft|write|send|message|propose|prepare|add|create|summari[sz]e|list|count)\b/;
const GO_PREFIX = /^(?:please\s+)?(?:take me to|bring me to|go to|open|show me|show|find|search for|search|pull up|jump to|get me)\s+(?:me\s+)?(?:the\s+)?(.+)$/;
const TYPE_WORD = /\b(mandate|role|candidate|profile|client|company)\b/g;

function cleanTarget(raw: string): { q: string; type: "mandate" | "candidate" | "client" | null } {
  let type: "mandate" | "candidate" | "client" | null = null;
  const q = raw
    .replace(TYPE_WORD, (w) => {
      const x = w.toLowerCase();
      type = x === "mandate" || x === "role" ? "mandate" : x === "client" || x === "company" ? "client" : "candidate";
      return " ";
    })
    .replace(/\b(page|for|of|please|in the crm|now)\b/g, " ")
    .replace(/[?.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { q, type };
}

export function parseIntent(raw: string): Intent {
  const text = raw.trim().replace(/\s+/g, " ");
  const t = text.toLowerCase();

  // People who left inside the guarantee, and refunds that follow.
  if (/\b(dropped|drop ?outs?|attrit\w*|refunds?|left (the )?(job|company))\b/.test(t)) return { kind: "dropped" };

  // Fees first: "fee collected for placements" is about money, not about who joined.
  if (/\b(fees?|collected|collections?|invoic\w*|receivables?|outstanding|billing|earned|earnings)\b/.test(t) || /\bpayments? (received|pending|due)\b/.test(t)) {
    return { kind: "fees", range: parseRange(t) };
  }
  if (/\b(placed|placements?|joined|joiners?|joining|hires?|closures?)\b/.test(t)) {
    return { kind: "placements", range: parseRange(t) };
  }

  const g = t.match(GO_PREFIX);
  if (g) {
    const { q, type } = cleanTarget(g[1]);
    // A place to jump to is a name or a short title. A long description ("find B2B SaaS account executives in Bangalore...") is a search for the assistant.
    if (q.split(" ").length > 5) return { kind: "agent" };
    if (q.length >= 2) return { kind: "go", q, type, explicit: true };
  }

  // A bare name or role title ("Service Manager", "Truein") is a lookup, not a question.
  const words = t.split(" ").filter(Boolean);
  if (words.length >= 1 && words.length <= 4 && !t.includes("?") && !WH.test(t)) {
    const { q, type } = cleanTarget(text);
    if (q.length >= 2) return { kind: "go", q, type, explicit: false };
  }
  return { kind: "agent" };
}
