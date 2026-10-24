import { EMAIL_RE, PRO_CC, PRO_FROM } from "@/lib/pro-sessions/core";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";
import type { CandidateResponse } from "./types";

const SIGN = "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088";
const firstName = (n: string) => n.trim().split(/\s+/)[0] || "there";

export const shareDefault = () =>
  "Your CV draft is ready for your review. Please open the link below, read it through, and either approve it or tell us what you would like changed. It only takes a few minutes, and you can suggest changes against any section.";

export type SendResult = { ok: true; sentTo: string } | { ok: false; error: string; status: number };

/** Emails the candidate their review link. Only ever called when someone presses Send on the share screen, to the address shown there. */
export async function sendShare(name: string, to: string, message: string, link: string): Promise<SendResult> {
  const address = to.trim().toLowerCase();
  if (!EMAIL_RE.test(address)) return { ok: false, error: "Enter a valid email address.", status: 400 };
  const body = message.trim().slice(0, 2500);
  if (body.length < 10) return { ok: false, error: "Write a short message first.", status: 400 };
  const text = [`Hi ${firstName(name)},`, body, link, SIGN].join("\n\n");
  try {
    await sendEmail({ to: address, cc: PRO_CC, subject: "Your CV draft is ready for review | StaffAnchor", text, html: invoiceEmailHtml(text), fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM });
  } catch (e) {
    console.error("cv share email failed", e);
    return { ok: false, error: "Couldn't send the email. Nothing was sent.", status: 500 };
  }
  return { ok: true, sentTo: address };
}

/** Tells the owner what the candidate decided. Internal, and never throws: a failed notice must not lose the candidate's answer. */
export async function notifyResponse(name: string, version: number, briefId: string, docId: string, r: CandidateResponse): Promise<void> {
  try {
    const parts = Object.keys(r.comments).length;
    const text = [
      `${name} ${r.decision === "approved" ? "approved their CV" : "asked for changes to their CV"} (version ${version}).`,
      parts ? `${parts} ${parts === 1 ? "section has" : "sections have"} comments.` : "",
      r.general ? `Their note: ${r.general}` : "",
      `Open it: https://clients.staffanchor.com/analytics/edge/cv/${briefId}/doc/${docId}`,
    ].filter(Boolean).join("\n\n");
    await sendEmail({ to: PRO_CC, subject: `CV ${r.decision === "approved" ? "approved" : "changes requested"}: ${name}`, text, html: invoiceEmailHtml(text), fromName: "StaffAnchor", fromEmail: PRO_FROM, replyTo: PRO_FROM });
  } catch (e) {
    console.error("cv response notice failed", e);
  }
}
