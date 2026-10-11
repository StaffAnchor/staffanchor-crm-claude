import crypto from "crypto";
import { whatsappEntryLink } from "@/lib/whatsapp-entry";

// "Complete your profile" email to people missing CTC / notice. Kept deliberately plain and personal
// so it behaves like mail from a person: text only, no attachments, one ask, an easy way out.

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com";
const SEND_GAP_MS = 2500;
export const MAX_PER_CLICK = 30;

/** How many we allow in any rolling 24 hours, growing as the mailbox proves itself. */
export function dailyCap(firstSentAt: string | null, nowMs: number): number {
  if (!firstSentAt) return 30;
  const days = (nowMs - new Date(firstSentAt).getTime()) / 86_400_000;
  if (days < 7) return 30;
  if (days < 14) return 60;
  return 100;
}

export const sendGapMs = SEND_GAP_MS;

const PHRASE: Record<string, string> = {
  current_ctc: "your current fixed CTC",
  expected_ctc: "your expected fixed CTC",
  notice: "your notice period",
};
const EXAMPLE: Record<string, string> = { current_ctc: "12 LPA", expected_ctc: "16 LPA", notice: "30 days" };

const sig = (candidateId: string) =>
  crypto.createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "unset").update(`unsub:${candidateId}`).digest("hex").slice(0, 32);

export const verifyUnsubscribe = (candidateId: string, token: string) => {
  const a = Buffer.from(sig(candidateId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
export const unsubscribeUrl = (candidateId: string) => `${APP_URL}/api/outreach/unsubscribe?c=${candidateId}&t=${sig(candidateId)}`;

export function buildOutreachEmail(c: { id: string; full_name: string | null; email: string }, asks: string[]) {
  const raw = (c.full_name ?? "").trim().split(/\s+/)[0] || "";
  const first = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "there";
  const keys = asks.filter((a) => PHRASE[a]);
  const phrases = keys.map((k) => PHRASE[k]);
  const list = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}` : phrases[0];
  const example = keys.map((k) => EXAMPLE[k]).join(", ");
  const form = `https://jobs.staffanchor.com/register?name=${encodeURIComponent(c.full_name ?? "")}&email=${encodeURIComponent(c.email)}&ref=${c.id}`;
  const wa = whatsappEntryLink("Hi StaffAnchor, I'm sharing my profile details as requested.");
  const stop = unsubscribeUrl(c.id);
  const subject = "Quick details to match you with the right roles";
  const text = `Hi ${first},

You registered your profile with StaffAnchor. To match you with the right roles, could you share ${list}?

Easiest: just reply to this email with a line like "${example}".
Or update it in a minute here: ${form}
Or message us on WhatsApp: ${wa}

Thanks,
StaffAnchor Team

If you'd rather not get these, tell us here and we won't ask again: ${stop}`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#111">
<p>Hi ${esc(first)},</p>
<p>You registered your profile with StaffAnchor. To match you with the right roles, could you share ${esc(list)}?</p>
<p>Easiest: just reply to this email with a line like &ldquo;${esc(example)}&rdquo;.<br>Or <a href="${form}">update it in a minute here</a>, or <a href="${wa}">message us on WhatsApp</a>.</p>
<p>Thanks,<br>StaffAnchor Team</p>
<p style="color:#777;font-size:12px">If you&rsquo;d rather not get these, <a href="${stop}" style="color:#777">tell us here</a> and we won&rsquo;t ask again.</p>
</div>`;
  return { subject, text, html, unsubscribe: stop };
}
