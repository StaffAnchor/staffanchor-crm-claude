import type { SupabaseClient } from "@supabase/supabase-js";
import { WINDOW_MS, phoneKey } from "@/lib/whatsapp-threads";

// Whether someone can be messaged right now, and how. This answers "who should I WhatsApp" with facts the CRM already holds:
// a usable number, no hold, no opt-out, whether their 24-hour chat window is open, and whether they were messaged recently.

export type Reach = {
  id: string;
  name: string;
  hasPhone: boolean;
  phoneHold: boolean;
  optedOut: boolean;
  windowOpen: boolean;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  templateSentLast2Days: boolean;
  hasEmail: boolean;
  /** Free-text reply is allowed only while their chat window is open. */
  canFreeText: boolean;
  /** A first or later message by an approved template. */
  canTemplate: boolean;
  why: string;
};

export async function reachFor(admin: SupabaseClient, ids: string[]): Promise<Map<string, Reach>> {
  const out = new Map<string, Reach>();
  if (!ids.length) return out;
  const { data: cands } = await admin.from("candidates").select("id, full_name, phone, phone_hold, email").in("id", ids);
  const rows = (cands ?? []) as { id: string; full_name: string | null; phone: string | null; phone_hold: boolean | null; email: string | null }[];
  const keys = rows.map((r) => phoneKey(r.phone)).filter((k): k is string => !!k && k.length === 10);
  const forms = Array.from(new Set(keys.flatMap((k) => [k, `91${k}`, `+91${k}`])));

  const [{ data: contacts }, { data: msgs }] = await Promise.all([
    keys.length ? admin.from("whatsapp_contacts").select("phone_key, opted_out").in("phone_key", keys) : Promise.resolve({ data: [] }),
    forms.length ? admin.from("whatsapp_messages").select("to_phone, direction, template_name, status, created_at").in("to_phone", forms).order("created_at", { ascending: false }).limit(3000) : Promise.resolve({ data: [] }),
  ]);
  const opted = new Set(((contacts ?? []) as { phone_key: string; opted_out: boolean | null }[]).filter((c) => c.opted_out).map((c) => c.phone_key));
  const byKey = new Map<string, { direction: string; template_name: string | null; status: string | null; created_at: string }[]>();
  for (const m of (msgs ?? []) as { to_phone: string; direction: string; template_name: string | null; status: string | null; created_at: string }[]) {
    const k = phoneKey(m.to_phone);
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), m]);
  }

  const now = new Date().getTime();
  for (const r of rows) {
    const key = phoneKey(r.phone);
    const usable = !!key && key.length === 10;
    const list = (usable && key ? byKey.get(key) : null) ?? [];
    const lastIn = list.find((m) => m.direction === "inbound")?.created_at ?? null;
    const lastOut = list.find((m) => m.direction === "outbound")?.created_at ?? null;
    const windowOpen = !!lastIn && now - new Date(lastIn).getTime() < WINDOW_MS;
    const recentTemplate = list.some((m) => m.direction === "outbound" && !!m.template_name && m.status === "sent" && now - new Date(m.created_at).getTime() < 2 * 86_400_000);
    const optedOut = usable && key ? opted.has(key) : false;
    const hold = !!r.phone_hold;
    let why = "";
    if (!usable) why = "no usable mobile number";
    else if (hold) why = "number on hold until the candidate confirms it";
    else if (optedOut) why = "asked not to get automatic messages";
    out.set(r.id, {
      id: r.id,
      name: r.full_name ?? "Unnamed",
      hasPhone: usable,
      phoneHold: hold,
      optedOut,
      windowOpen,
      lastInboundAt: lastIn,
      lastOutboundAt: lastOut,
      templateSentLast2Days: recentTemplate,
      hasEmail: !!r.email && !String(r.email).endsWith(".invalid"),
      canFreeText: usable && !hold && !optedOut && windowOpen,
      canTemplate: usable && !hold && !optedOut && !recentTemplate,
      why: why || (recentTemplate ? "a template message already went in the last 2 days" : ""),
    });
  }
  return out;
}
