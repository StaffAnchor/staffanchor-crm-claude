import { sendEmail, renderEmailShell } from "@/lib/mail";

// One place for the Sales Circle joining link, so the first invite (on
// approval) and a resend can never drift apart in wording or expiry.
export const REFERRER_INVITE_TTL_DAYS = 14;
export const REFERRER_INVITE_TTL_MS = REFERRER_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000;

export const REFERRER_LOGIN_URL = "https://clients.staffanchor.com/login";

export const referrerSignupUrl = (token: string) => `https://clients.staffanchor.com/referrer-signup/${token}`;

export const referrerMailConfigured = () => !!(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendReferrerInviteEmail({ to, name, signupUrl, reminder }: { to: string; name: string; signupUrl: string; reminder: boolean }) {
  const lead = reminder
    ? "Here is a fresh link to set up your StaffAnchor Sales Circle account. Any earlier link no longer works."
    : "Your application to StaffAnchor Sales Circle has been approved.";
  await sendEmail({
    to,
    subject: reminder ? "Your StaffAnchor Sales Circle joining link" : `You're in -- set up your StaffAnchor Sales Circle account`,
    text: `Hi ${name},\n\n${lead}\n\nSet up your account here: ${signupUrl}\n\nThis link expires in ${REFERRER_INVITE_TTL_DAYS} days.\n\nOnce your account is set up, sign in any time at: ${REFERRER_LOGIN_URL} (use the email and password you choose).\n\nThanks,\nStaffAnchor Team`,
    html: renderEmailShell({
      preheader: `Set up your Sales Circle account.`,
      bodyHtml: `<p>Hi ${esc(name)},</p><p>${lead}</p><p><a href="${signupUrl}">Set up your account here</a> — this link expires in ${REFERRER_INVITE_TTL_DAYS} days.</p><p>Once your account is set up, you can sign in any time at <a href="${REFERRER_LOGIN_URL}">${REFERRER_LOGIN_URL}</a> using the email and password you choose.</p><p>Thanks,<br/>StaffAnchor Team</p>`,
    }),
  });
}
