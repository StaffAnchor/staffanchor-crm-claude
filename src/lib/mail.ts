import nodemailer from "nodemailer";
import path from "path";

// Every route used to build its own nodemailer transporter inline and hand-roll
// a bare `<p>...` string for the email body -- ten near-identical copies of the
// same plumbing, and every email looked like unstyled default output (no logo,
// no brand color, no consistent footer). This file is the single shared place
// for both: sendEmail() owns the transporter + the logo attachment, and
// renderEmailShell() wraps a route's own body markup in a lightweight branded
// layout, mirroring the letterhead treatment already used for the JD PDF
// (src/lib/generate-jd-pdf.tsx) -- same logo, same palette.

const LOGO_CID = "staffanchor-logo";
const LOGO_PATH = path.join(process.cwd(), "public", "staffanchor-logo-pdf.png");

// Same palette as generate-jd-pdf.tsx.
const NAVY = "#0F172A";
const SLATE = "#475569";
const MUTED = "#94A3B8";
const BORDER = "#E5E7EB";
const SURFACE = "#F8FAFC";

const FONT_STACK = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

// Table-based layout with everything inlined -- the only markup that renders
// consistently across Gmail, Outlook desktop, and mobile mail clients. No
// external stylesheet, no flex/grid, no custom @font-face (email clients
// don't reliably load them) -- just the system sans stack.
export function renderEmailShell({ preheader, bodyHtml }: { preheader?: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StaffAnchor</title>
  </head>
  <body style="margin:0;padding:0;background-color:${SURFACE};">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;">
            <tr>
              <td style="padding:26px 28px 18px 28px;">
                <img src="cid:${LOGO_CID}" width="104" height="41" alt="StaffAnchor" style="display:block;border:0;outline:none;" />
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-family:${FONT_STACK};font-size:14px;line-height:1.65;color:${SLATE};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid ${BORDER};font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:16px 28px;font-family:${FONT_STACK};font-size:11px;color:${MUTED};">
                <span style="color:${NAVY};font-weight:600;">StaffAnchor</span>&nbsp;&middot;&nbsp;www.staffanchor.com
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

type MailAttachment = { filename: string; content?: Buffer; path?: string; contentType?: string; cid?: string };

export async function sendEmail({
  to,
  subject,
  html,
  text,
  attachments,
  fromName = "StaffAnchor",
}: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  fromName?: string;
}) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    throw new Error("Email not configured (missing GMAIL_USER/GMAIL_APP_PASSWORD)");
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  await transporter.sendMail({
    from: `"${fromName}" <${gmailUser}>`,
    to,
    subject,
    text,
    html,
    // The logo is embedded via cid: (not a remote/base64 <img src>) because
    // that's the one image-loading method every major mail client -- including
    // Outlook desktop and Gmail's image-blocking-by-default mode -- renders
    // without the user having to click "show images".
    attachments: [{ filename: "staffanchor-logo.png", path: LOGO_PATH, cid: LOGO_CID }, ...(attachments ?? [])],
  });
}
