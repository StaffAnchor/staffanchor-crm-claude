import { renderEmailShell } from "@/lib/mail";

// Invoices go out from the firm's info@ address with a copy to the owner. Both
// can be changed in Vercel without a code change.
export const INVOICE_FROM = process.env.INVOICE_EMAIL_FROM || "info@staffanchor.com";
export const INVOICE_CC = process.env.INVOICE_EMAIL_CC || "gagan@staffanchor.com";

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// Accepts "a@x.com, b@y.com" or newline / semicolon separated; returns the
// valid list and anything that wasn't an address.
export function parseEmailList(raw: string): { ok: string[]; bad: string[] } {
  const parts = raw.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const ok: string[] = [];
  const bad: string[] = [];
  for (const p of parts) {
    if (!EMAIL_RE.test(p)) bad.push(p);
    else if (!seen.has(p.toLowerCase())) {
      seen.add(p.toLowerCase());
      ok.push(p);
    }
  }
  return { ok, bad };
}

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The editable plain-text body becomes the branded email's HTML.
export function invoiceEmailHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0;">${esc(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
  return renderEmailShell({ preheader: "Invoice attached", bodyHtml: paragraphs });
}

export function defaultInvoiceEmail(opts: {
  kind: "proforma" | "final";
  number: string;
  contactName: string | null;
  clientName: string;
  candidateName: string;
  designation: string;
  totalInr: number;
}): { subject: string; body: string } {
  const doc = opts.kind === "proforma" ? "Proforma Invoice" : "Tax Invoice";
  const first = opts.contactName?.trim().split(/\s+/)[0];
  const amount = `₹${opts.totalInr.toLocaleString("en-IN")}`;
  const ask =
    opts.kind === "proforma"
      ? "Please arrange the payment to the bank account on the invoice and share the payment confirmation with us. A Tax Invoice will follow once it is received."
      : "Thank you for the payment. This is the Tax Invoice for your records.";
  return {
    subject: `${doc} ${opts.number} | ${opts.clientName} | ${opts.candidateName}`,
    body: [
      `Hi ${first || "Team"},`,
      `Please find attached ${doc} ${opts.number} for ${opts.candidateName} (${opts.designation}) placed with ${opts.clientName}. The total is ${amount} including GST.`,
      ask,
      "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 9818881142",
    ].join("\n\n"),
  };
}
