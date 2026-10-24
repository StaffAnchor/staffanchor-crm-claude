import type { SupabaseClient } from "@supabase/supabase-js";
import { EMAIL_RE, PRO_CC, PRO_FROM } from "@/lib/pro-sessions/core";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";
import { jobsLink } from "./store";

const SIGN = "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088";
const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";

async function send(to: string, cc: string | undefined, subject: string, text: string) {
  await sendEmail({ to, cc, subject, text, html: invoiceEmailHtml(text), fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM });
}

/** What the reminder says before the person pressing the button edits it. Different if they never opened the form or are part-way. */
export function reminderDefault(name: string, token: string, state: "sent" | "opened" | "started"): string {
  const link = jobsLink(token);
  if (state === "started")
    return `You have made a good start on the career details form. The rest takes only a few minutes, and what you add now is what makes your CV stronger. Your answers are saved, so you can carry on from where you stopped:\n\n${link}\n\nNothing is compulsory, so skip anything you can't share.`;
  return `A quick reminder about the short career details form. It takes about 10 to 15 minutes and helps us write a CV that shows what you have actually achieved. Upload your current CV first and it fills in your jobs for you:\n\n${link}\n\nNothing is compulsory, so skip anything you can't share.`;
}

export type ReminderResult = { ok: true; sentTo: string } | { ok: false; error: string; status: number };

/** Sends a reminder. Only ever called when someone presses Send on the reminder screen, to the address shown there. */
export async function sendReminder(db: SupabaseClient, brief: { id: string; name: string; status: string; reminder_count: number }, to: string, message: string): Promise<ReminderResult> {
  if (brief.status === "submitted") return { ok: false, error: "They have already submitted the form.", status: 409 };
  const address = to.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  const body = message.trim().slice(0, 2500);
  if (body.length < 10) return { ok: false, error: "Write a short message first.", status: 400 };
  const text = [`Hi ${firstName(brief.name)},`, body, SIGN].join("\n\n");
  try {
    await send(address, PRO_CC, "Your career details form | StaffAnchor", text);
  } catch (e) {
    console.error("cv-brief reminder failed", e);
    return { ok: false, error: "Couldn't send the email. Nothing was sent.", status: 500 };
  }
  await db.from("cv_briefs").update({ reminder_count: (brief.reminder_count ?? 0) + 1, last_reminded_at: new Date().toISOString(), last_reminded_to: address }).eq("id", brief.id);
  return { ok: true, sentTo: address };
}

/**
 * On submit. First time: a "we have your details" email to the candidate (like the resume form sends), with a copy to the
 * owner as the internal notice. Later edits and anyone with no email on file: the owner is told, the candidate is not emailed again.
 * Never throws: a failed email must not fail the candidate's submit.
 */
export async function notifySubmitted(db: SupabaseClient, brief: { id: string; token: string; name: string; email: string | null; received_email_at: string | null }, basicsEmail: string, submitCount: number): Promise<void> {
  const to = [brief.email ?? "", basicsEmail].map((e) => e.trim().toLowerCase()).find((e) => EMAIL_RE.test(e)) ?? "";
  try {
    if (to && !brief.received_email_at && submitCount <= 1) {
      const text = [
        `Hi ${firstName(brief.name)},`,
        "Thank you, we have your career details.",
        "Our team will go through them and use them to prepare your CV. If you remember anything else, go back to your link and add it any time. It saves just like before:",
        jobsLink(brief.token),
        SIGN,
      ].join("\n\n");
      await send(to, PRO_CC, "We have your career details | StaffAnchor", text);
      await db.from("cv_briefs").update({ received_email_at: new Date().toISOString() }).eq("id", brief.id);
      return;
    }
    const what = submitCount > 1 ? "updated their CV form" : "submitted their CV form";
    const text = `${brief.name} ${what}${to ? "" : " (no email address on file, so they were not emailed)"}.\n\nOpen it: https://clients.staffanchor.com/analytics/edge/cv/${brief.id}`;
    await send(PRO_CC, undefined, `CV form ${submitCount > 1 ? "updated" : "submitted"}: ${brief.name}`, text);
  } catch (e) {
    console.error("cv-brief submit notification failed", e);
  }
}
