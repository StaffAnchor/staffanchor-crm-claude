import crypto from "crypto";

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

const NAVY = "#0F172A";
const SLATE = "#475569";
const MUTED = "#94A3B8";
const BLUE = "#1D4ED8";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The "complete your details" email. One voice for everyone, whether they registered, applied to a role
 * we shared, or were referred: it never says how they reached us. Light typographic design, no images
 * or attachments, links hidden behind words, so it reads like a note from a person and stays out of spam.
 */
export function buildOutreachEmail(c: { id: string; full_name: string | null; email: string }, asks: string[]) {
  const raw = (c.full_name ?? "").trim().split(/\s+/)[0] || "";
  const first = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "there";
  const keys = asks.filter((a) => PHRASE[a]);
  const phrases = keys.map((k) => PHRASE[k].replace(/^your /, ""));
  const list = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}` : phrases[0];
  const example = keys.map((k) => EXAMPLE[k]).join(", ");
  const form = `${APP_URL}/u/${c.id}`;
  const wa = `${APP_URL}/w/${c.id}`;
  const stop = unsubscribeUrl(c.id);
  const subject = first === "there" ? "A reply needed to present your profile to hiring managers" : `${first}, a reply needed to present your profile to hiring managers`;

  const text = `Hi ${first},

Thank you for your interest in opportunities through StaffAnchor.

We're shortlisting for roles right now, and we want to present your profile in the strongest possible way. To do that properly we need your ${list}. Hiring managers screen on these first, so they decide whether a strong profile gets seen at all, and this is a key part of your job search with us.

The quickest way is to reply to this email with a single line, for example: ${example}.

Prefer a form? ${form}
Prefer WhatsApp? ${wa}

We use these details only to match you with suitable roles.

Warm regards,
StaffAnchor Talent Solutions
www.staffanchor.com

Don't want these requests? ${stop}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">A one-line reply is all it takes to get your profile presented properly.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;">
<tr><td style="padding:26px 34px 0 34px;font-family:Georgia,'Times New Roman',serif;font-size:19px;letter-spacing:0.4px;color:${NAVY};">StaffAnchor<span style="color:${BLUE};">.</span></td></tr>
<tr><td style="padding:6px 34px 0 34px;"><div style="height:1px;background:#E5E7EB;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:22px 34px 8px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${NAVY};">
<p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>
<p style="margin:0 0 16px 0;">Thank you for your interest in opportunities through StaffAnchor.</p>
<p style="margin:0 0 16px 0;">We&rsquo;re shortlisting for roles right now, and we want to present your profile in the strongest possible way. To do that properly we need your <strong>${esc(list)}</strong>. Hiring managers screen on these first, so they decide whether a strong profile gets seen at all, and this is a key part of your job search with us.</p>
<p style="margin:0 0 6px 0;">The quickest way: <strong>just reply to this email with one line</strong>, for example:</p>
<p style="margin:0 0 20px 0;padding:10px 14px;background:#F8FAFC;border-left:3px solid ${BLUE};color:${SLATE};">${esc(example)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;"><tr><td style="background:${BLUE};border-radius:6px;"><a href="${form}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;">Share my details</a></td></tr></table>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">Prefer WhatsApp? <a href="${wa}" style="color:${BLUE};text-decoration:none;font-weight:600;">Message us here</a> and it&rsquo;s one tap.</p>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">We use these details only to match you with suitable roles.</p>
<p style="margin:0 0 4px 0;">Warm regards,</p>
<p style="margin:0 0 6px 0;font-weight:600;">StaffAnchor Talent Solutions</p>
</td></tr>
<tr><td style="padding:14px 34px 24px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #F1F5F9;">
<a href="https://www.staffanchor.com" style="color:${MUTED};text-decoration:none;">www.staffanchor.com</a> &nbsp;&middot;&nbsp; Don&rsquo;t want these requests? <a href="${stop}" style="color:${MUTED};text-decoration:underline;">Tell us and we won&rsquo;t ask again</a>.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html, unsubscribe: stop };
}

const LABEL_FOR_WELCOME: Record<string, string> = {
  sub_domain: "practice or function",
  current_employer: "current employer",
  current_job_title: "current job title",
  current_employment_status: "employment status",
  current_industry: "current industry",
  total_experience_years: "total experience",
  current_fixed_ctc: "current fixed CTC",
  expected_fixed_ctc: "expected fixed CTC",
  notice_period: "notice period",
  role_type: "whether you lead a team",
  highest_qualification: "highest qualification",
  work_mode: "preferred work mode",
  open_to_relocation: "openness to relocation",
  resume: "latest resume",
};

/**
 * The email a candidate gets when a recruiter creates their profile from a CV (bulk upload or one at a
 * time). Same voice and design as the outreach email: it never assumes how they reached us, the login
 * link sits behind a button, and replying with one line is always an option.
 */
export function buildWelcomeEmail(
  c: { id: string; full_name: string | null },
  missingFields: string[],
  actionLink: string
) {
  const raw = (c.full_name ?? "").trim().split(/\s+/)[0] || "";
  const first = raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "there";
  const wanted = missingFields.map((f) => LABEL_FOR_WELCOME[f]).filter(Boolean).slice(0, 5);
  const items = wanted.length ? wanted : ["current fixed CTC", "expected fixed CTC", "notice period"];
  const list = items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0];
  const stop = unsubscribeUrl(c.id);
  const subject = first === "there" ? "Confirm your profile so we can present you to hiring managers" : `${first}, confirm your profile so we can present you to hiring managers`;

  const text = `Hi ${first},

Thank you for your interest in opportunities through StaffAnchor.

We've set up your profile from your CV so we can present you for the right roles. A CV can't tell us a few things hiring managers screen on first, so we need your ${list}. This is a key part of your job search with us.

It takes about a minute: confirm what we already have and add the rest. No password needed.
${actionLink}

Or simply reply to this email with the details in one line.

We use these details only to match you with suitable roles.

Warm regards,
StaffAnchor Talent Solutions
www.staffanchor.com

Don't want these requests? ${stop}`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your profile is ready. One minute to confirm it and add your ${esc(list)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;">
<tr><td style="padding:26px 34px 0 34px;font-family:Georgia,'Times New Roman',serif;font-size:19px;letter-spacing:0.4px;color:${NAVY};">StaffAnchor<span style="color:${BLUE};">.</span></td></tr>
<tr><td style="padding:6px 34px 0 34px;"><div style="height:1px;background:#E5E7EB;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:22px 34px 8px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${NAVY};">
<p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>
<p style="margin:0 0 16px 0;">Thank you for your interest in opportunities through StaffAnchor.</p>
<p style="margin:0 0 16px 0;">We&rsquo;ve set up your profile from your CV so we can present you for the right roles. A CV can&rsquo;t tell us a few things hiring managers screen on first, so we need your <strong>${esc(list)}</strong>. This is a key part of your job search with us.</p>
<p style="margin:0 0 18px 0;">It takes about a minute: confirm what we already have and add the rest. <span style="color:${SLATE};">No password needed.</span></p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;"><tr><td style="background:${BLUE};border-radius:6px;"><a href="${actionLink}" style="display:inline-block;padding:11px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#FFFFFF;text-decoration:none;">Confirm my profile</a></td></tr></table>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">Prefer not to sign in? <strong>Just reply to this email</strong> with the details in one line.</p>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">We use these details only to match you with suitable roles.</p>
<p style="margin:0 0 4px 0;">Warm regards,</p>
<p style="margin:0 0 6px 0;font-weight:600;">StaffAnchor Talent Solutions</p>
</td></tr>
<tr><td style="padding:14px 34px 24px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #F1F5F9;">
<a href="https://www.staffanchor.com" style="color:${MUTED};text-decoration:none;">www.staffanchor.com</a> &nbsp;&middot;&nbsp; Don&rsquo;t want these requests? <a href="${stop}" style="color:${MUTED};text-decoration:underline;">Tell us and we won&rsquo;t ask again</a>.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html, unsubscribe: stop };
}
