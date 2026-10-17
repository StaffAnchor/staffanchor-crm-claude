import { APP_URL, signedToken, unsubscribeUrl } from "@/lib/outreach";

// Two plain, personal emails sent from the team mailbox: "are you open to hearing about roles?" to people in the
// database, and "who is the best seller you know?" to people we have placed or rate highly. Same restrained look as the
// profile-completion email: text-led, no images, one clear action, an easy way out.

const NAVY = "#0F172A";
const SLATE = "#475569";
const MUTED = "#94A3B8";
const ACCENT = "#0F766E";
export const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_URL ?? "https://jobs.staffanchor.com";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const firstName = (full: string | null) => {
  const raw = (full ?? "").trim().split(/\s+/)[0] || "";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : "there";
};

function shell(subject: string, preheader: string, inner: string, stop: string) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F7FA;padding:28px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#FFFFFF;border:1px solid #E5E7EB;border-radius:10px;">
<tr><td style="padding:26px 34px 0 34px;font-family:Georgia,'Times New Roman',serif;font-size:19px;letter-spacing:0.4px;color:${NAVY};">StaffAnchor<span style="color:${ACCENT};">.</span></td></tr>
<tr><td style="padding:6px 34px 0 34px;"><div style="height:1px;background:#E5E7EB;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
<tr><td style="padding:22px 34px 8px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${NAVY};">${inner}</td></tr>
<tr><td style="padding:14px 34px 24px 34px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #F1F5F9;">
<a href="https://www.staffanchor.com" style="color:${MUTED};text-decoration:none;">www.staffanchor.com</a> &nbsp;&middot;&nbsp; Don&rsquo;t want these emails? <a href="${stop}" style="color:${MUTED};text-decoration:underline;">Tell us and we won&rsquo;t send them again</a>.
</td></tr></table></td></tr></table></body></html>`;
}

const button = (href: string, label: string, solid = true) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="display:inline-table;margin:0 10px 10px 0;"><tr><td style="${solid ? `background:${ACCENT};` : `border:1px solid ${ACCENT};`}border-radius:6px;"><a href="${href}" style="display:inline-block;padding:11px 20px;font-size:14.5px;font-weight:600;color:${solid ? "#FFFFFF" : ACCENT};text-decoration:none;">${esc(label)}</a></td></tr></table>`;

export function respondUrl(candidateId: string, answer: "open" | "not_now") {
  return `${APP_URL}/api/outreach/respond?c=${candidateId}&t=${signedToken(candidateId, "respond")}&a=${answer}`;
}
export const referUrl = (candidateId: string, roleCode?: string | null) => `${JOBS_SITE}/refer/${candidateId}?t=${signedToken(candidateId, "refer")}${roleCode ? `&m=${roleCode}` : ""}`;

/** "Are you open to hearing about a new role?" `role` is what we know they do, e.g. "SaaS Account Executive". */
export function buildReactivationEmail(c: { id: string; full_name: string | null }, role: string) {
  const first = firstName(c.full_name);
  const subject = first === "there" ? `Open to hearing about a new ${role} role?` : `${first}, open to hearing about a new ${role} role?`;
  const yes = respondUrl(c.id, "open");
  const later = respondUrl(c.id, "not_now");
  const stop = unsubscribeUrl(c.id);
  const text = `Hi ${first},

You're registered with StaffAnchor. We place sales and revenue professionals with companies that are hiring, and your profile as a ${role} is one we'd like to keep in mind for the right role.

Would you be open to hearing about a new opportunity if it was a good fit? One tap is all we need:

Yes, I'm open: ${yes}
Not right now: ${later}

We won't share your details with anyone without asking you first.

Warm regards,
StaffAnchor Talent Solutions
www.staffanchor.com

Don't want these emails? ${stop}`;
  const html = shell(
    subject,
    "One tap tells us whether to keep you in mind for new roles.",
    `<p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>
<p style="margin:0 0 16px 0;">You&rsquo;re registered with StaffAnchor. We place sales and revenue professionals with companies that are hiring, and your profile as a <strong>${esc(role)}</strong> is one we&rsquo;d like to keep in mind for the right role.</p>
<p style="margin:0 0 16px 0;">Would you be open to hearing about a new opportunity if it was a good fit? One tap is all we need.</p>
<p style="margin:0 0 14px 0;">${button(yes, "Yes, I’m open")}${button(later, "Not right now", false)}</p>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">We won&rsquo;t share your details with anyone without asking you first.</p>
<p style="margin:0 0 4px 0;">Warm regards,</p><p style="margin:0 0 6px 0;font-weight:600;">StaffAnchor Talent Solutions</p>`,
    stop
  );
  return { subject, text, html, unsubscribe: stop };
}

/** "Know a great seller?" Wording on the reward matches the existing refer-and-earn programme. */
export function buildReferralAskEmail(c: { id: string; full_name: string | null }) {
  const first = firstName(c.full_name);
  const subject = first === "there" ? "Who is the best seller you know?" : `${first}, who is the best seller you know?`;
  const link = referUrl(c.id);
  const stop = unsubscribeUrl(c.id);
  const text = `Hi ${first},

The best people we place usually come to us through someone they trust.

If there's a sales or revenue professional you'd back, share their name and email in under a minute. We'll take it from there, and we'll only contact them with a relevant role.

Refer someone: ${link}

If we place them and they stay 90 days, you earn up to ₹10,000.

Thank you,
StaffAnchor Talent Solutions
www.staffanchor.com

Don't want these emails? ${stop}`;
  const html = shell(
    subject,
    "Share a name in under a minute. You earn if they are placed and stay 90 days.",
    `<p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>
<p style="margin:0 0 16px 0;">The best people we place usually come to us through someone they trust.</p>
<p style="margin:0 0 16px 0;">If there&rsquo;s a sales or revenue professional you&rsquo;d back, share their name and email in under a minute. We&rsquo;ll take it from there, and we&rsquo;ll only contact them with a relevant role.</p>
<p style="margin:0 0 14px 0;">${button(link, "Refer someone")}</p>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">If we place them and they stay 90 days, you earn up to &#8377;10,000.</p>
<p style="margin:0 0 4px 0;">Thank you,</p><p style="margin:0 0 6px 0;font-weight:600;">StaffAnchor Talent Solutions</p>`,
    stop
  );
  return { subject, text, html, unsubscribe: stop };
}

/** "We're hiring a <role> in <city>. Know someone who'd fit?" The link opens that role and saves the referral against it. */
export function buildRoleReferralAskEmail(c: { id: string; full_name: string | null }, role: { title: string; city: string | null; code: string }) {
  const first = firstName(c.full_name);
  const where = role.city ? ` in ${role.city}` : "";
  const subject = first === "there" ? `We're hiring a ${role.title}${where}. Know someone?` : `${first}, we're hiring a ${role.title}${where}. Know someone?`;
  const link = referUrl(c.id, role.code);
  const stop = unsubscribeUrl(c.id);
  const text = `Hi ${first},

We're hiring a ${role.title}${where}. Do you know a strong sales professional who'd fit?

See the role and refer them: ${link}

We'll only contact them about relevant roles. If we place them and they stay 90 days, you earn up to \u20B910,000.

Thank you,
StaffAnchor Talent Solutions
www.staffanchor.com

Don't want these emails? ${stop}`;
  const html = shell(
    subject,
    "See the role and share a name in under a minute.",
    `<p style="margin:0 0 16px 0;">Hi ${esc(first)},</p>
<p style="margin:0 0 16px 0;">We&rsquo;re hiring a <strong>${esc(role.title)}</strong>${esc(where)}. Do you know a strong sales professional who&rsquo;d fit?</p>
<p style="margin:0 0 14px 0;">${button(link, "See the role and refer")}</p>
<p style="margin:0 0 20px 0;color:${SLATE};font-size:14px;">We&rsquo;ll only contact them about relevant roles. If we place them and they stay 90 days, you earn up to &#8377;10,000.</p>
<p style="margin:0 0 4px 0;">Thank you,</p><p style="margin:0 0 6px 0;font-weight:600;">StaffAnchor Talent Solutions</p>`,
    stop
  );
  return { subject, text, html, unsubscribe: stop };
}
