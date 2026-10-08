// Turns the flat whatsapp_messages log into conversations a recruiter can work.
// A conversation is one phone number. In this table `to_phone` holds the other
// person's number for both directions (for inbound it is the sender).

export type WaMessage = {
  id: string;
  created_at: string;
  candidate_id: string | null;
  direction: "inbound" | "outbound";
  to_phone: string | null;
  body_preview: string | null;
  status: string | null;
  error: string | null;
  template_name: string | null;
  media_path?: string | null;
  media_name?: string | null;
};

export type WaConversation = {
  key: string;
  phone: string;
  candidateId: string | null;
  messages: WaMessage[]; // oldest first
  lastAt: string;
  lastInboundAt: string | null;
  /** the last thing said was by them: a recruiter owes a reply */
  needsReply: boolean;
  /** WhatsApp only allows free-form replies for 24 hours after their last message */
  windowOpen: boolean;
};

export const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Match numbers regardless of country code or formatting by their last 10 digits. */
export const phoneKey = (p: string | null | undefined): string | null => {
  const d = (p ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : d || null;
};

export function groupConversations(messages: WaMessage[], now: number): WaConversation[] {
  const byKey = new Map<string, WaMessage[]>();
  for (const m of messages) {
    const key = phoneKey(m.to_phone);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), m]);
  }
  const out: WaConversation[] = [];
  for (const [key, list] of byKey) {
    const msgs = [...list].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const last = msgs[msgs.length - 1];
    const lastInbound = [...msgs].reverse().find((m) => m.direction === "inbound") ?? null;
    out.push({
      key,
      phone: last.to_phone ?? key,
      candidateId: msgs.find((m) => m.candidate_id)?.candidate_id ?? null,
      messages: msgs,
      lastAt: last.created_at,
      lastInboundAt: lastInbound?.created_at ?? null,
      needsReply: last.direction === "inbound",
      windowOpen: !!lastInbound && now - new Date(lastInbound.created_at).getTime() < WINDOW_MS,
    });
  }
  return out.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

/** Show a number the same way however it was stored: 10 digits are Indian numbers, so "+91 98765 43210". */
export const formatPhone = (p: string | null | undefined): string => {
  const d = (p ?? "").replace(/\D/g, "");
  const local = d.length === 10 ? d : d.length === 12 && d.startsWith("91") ? d.slice(2) : null;
  return local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : `+${d}`;
};
