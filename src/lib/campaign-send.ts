import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/mail";
import { dailyCap, MAX_PER_CLICK, sendGapMs } from "@/lib/outreach";

export type Recipient = { id: string; full_name: string | null; email: string };
type Built = { subject: string; text: string; html: string; unsubscribe: string };

/** How many more emails may go out in the rolling 24 hours: the one limit shared by every kind of email we send. */
export async function emailRoom(admin: SupabaseClient) {
  const { data: stats } = await admin.rpc("outreach_stats");
  const s = (stats ?? {}) as { sent_24h?: number; first_sent_at?: string | null };
  const cap = dailyCap(s.first_sent_at ?? null, new Date().getTime());
  return { cap, room: Math.max(0, cap - (s.sent_24h ?? 0)) };
}

/**
 * Sends a small, paced batch, always started by a person pressing a button. Logs each send (or failure) so the daily
 * limit, the 30-day rest between emails and the history all see it. Stops if the mailbox starts failing.
 */
export async function sendBatch(admin: SupabaseClient, userId: string, kind: "reactivation" | "referral_ask", people: Recipient[], build: (c: Recipient) => Built, asked: string[] = []) {
  const { cap, room } = await emailRoom(admin);
  const want = Math.min(people.length, MAX_PER_CLICK, room);
  if (want <= 0) return { sent: 0, failed: 0, note: `Today's limit of ${cap} is used up. It frees up on a rolling 24 hours.` };
  let sent = 0;
  let failed = 0;
  let consecutive = 0;
  for (const c of people.slice(0, want)) {
    if (consecutive >= 3) break;
    const mail = build(c);
    try {
      await sendEmail({ to: c.email, subject: mail.subject, text: mail.text, html: mail.html, plain: true, headers: { "List-Unsubscribe": `<${mail.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      await admin.from("profile_outreach").insert({ candidate_id: c.id, kind, channel: "email", status: "sent", asked, to_email: c.email, sent_by: userId });
      sent++;
      consecutive = 0;
    } catch (err) {
      await admin.from("profile_outreach").insert({ candidate_id: c.id, kind, channel: "email", status: "failed", asked, to_email: c.email, error: err instanceof Error ? err.message.slice(0, 300) : "send failed", sent_by: userId });
      failed++;
      consecutive++;
    }
    await new Promise((r) => setTimeout(r, sendGapMs));
  }
  return { sent, failed, note: people.length > want ? `${people.length - want} more were not included (limit per press, or today's limit). Press again for them.` : null, stoppedEarly: consecutive >= 3 };
}
