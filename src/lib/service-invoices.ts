import type { SupabaseClient } from "@supabase/supabase-js";
import { renderInvoicePdf, fyShort, invoicePrefix, round2 } from "@/lib/invoice-pdf";
import { PRO_CC, PRO_FROM, formatIst } from "@/lib/pro-sessions/core";
import { TIERS, type TierKey } from "@/lib/resume-orders/core";
import { sendEmail } from "@/lib/mail";
import { invoiceEmailHtml } from "@/lib/invoice-email";

// Tax invoices for what jobseekers pay on the website (StaffAnchor Edge sessions and Resume Writing). Prices include
// 18% GST. An invoice is made automatically when a payment completes and kept; it is emailed only on request.
// These are invoices to individuals, so there is no customer GSTIN. With no customer address on record the place of
// supply is the supplier's own state (Uttar Pradesh), which means CGST 9% plus SGST 9%.

export type InvoiceKind = "edge" | "resume";

type Row = {
  id: string;
  kind: InvoiceKind;
  ref_id: string;
  invoice_number: string;
  amount_inr: number;
  customer_name: string | null;
  customer_email: string | null;
  pdf_path: string | null;
  sent_at: string | null;
  sent_to: string | null;
};

const BUCKET = "invoices";

/** Price before GST, from a GST-inclusive price. */
export const splitInclusive = (inclusive: number) => {
  const taxable = round2(inclusive / 1.18);
  return { taxable, gst: round2(inclusive - taxable) };
};

async function describe(db: SupabaseClient, kind: InvoiceKind, refId: string) {
  if (kind === "edge") {
    const { data: b } = await db.from("pro_bookings").select("name, email, phone, amount_inr, service_slug, slot_start, status").eq("id", refId).maybeSingle();
    if (!b || b.status !== "paid") return null;
    const { data: s } = await db.from("pro_services").select("title, duration_min").eq("slug", b.service_slug).maybeSingle();
    return {
      name: b.name as string,
      email: b.email as string,
      phone: b.phone as string,
      amount: b.amount_inr as number,
      line: `StaffAnchor Edge: ${s?.title ?? b.service_slug} (${s?.duration_min ?? ""} min video session on ${formatIst(new Date(b.slot_start))} IST)`,
    };
  }
  const { data: o } = await db.from("resume_orders").select("name, email, phone, amount_inr, tier, status, experience_years").eq("id", refId).maybeSingle();
  if (!o || o.status === "pending_payment" || o.status === "failed") return null;
  const t = TIERS[o.tier as TierKey];
  return {
    name: o.name as string,
    email: o.email as string,
    phone: o.phone as string,
    amount: o.amount_inr as number,
    line: `Resume Writing: ${t.label} (${t.band})`,
  };
}

/** Makes the invoice for a paid booking or order if there is not one yet. Safe to call twice. */
export async function ensureServiceInvoice(db: SupabaseClient, kind: InvoiceKind, refId: string): Promise<Row | null> {
  const { data: existing } = await db.from("service_invoices").select("*").eq("kind", kind).eq("ref_id", refId).maybeSingle();
  if (existing) return existing as Row;
  const d = await describe(db, kind, refId);
  if (!d) return null;

  const now = new Date();
  const { data: seq, error: seqError } = await db.rpc("next_invoice_number", { p_kind: "final", p_fy: fyShort(now) });
  if (seqError || typeof seq !== "number") return null;
  const number = `${invoicePrefix("final", now)}${String(seq).padStart(3, "0")}`;
  const { taxable, gst } = splitInclusive(d.amount);

  const pdf = await renderInvoicePdf({
    kind: "final",
    paid: true,
    paymentMode: "Online (Razorpay)",
    invoiceNumber: number,
    invoiceDate: now,
    client: { name: d.name, gstin: null, billingAddress: `${d.email}\n${d.phone}`, stateCode: "09", stateName: "Uttar Pradesh" },
    item: { candidateName: d.name, designation: "", location: null, dateOfJoining: null, billingAmount: taxable, description: d.line },
  });
  const path = `service/${number.replace(/\//g, "-")}.pdf`;
  const { error: upError } = await db.storage.from(BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: true });
  if (upError) return null;
  const { data: row, error } = await db
    .from("service_invoices")
    .insert({ kind, ref_id: refId, invoice_number: number, amount_inr: d.amount, taxable, gst, customer_name: d.name, customer_email: d.email, pdf_path: path })
    .select("*")
    .single();
  if (error) {
    // A parallel call made it first; use that one.
    const { data: again } = await db.from("service_invoices").select("*").eq("kind", kind).eq("ref_id", refId).maybeSingle();
    return (again as Row | null) ?? null;
  }
  return row as Row;
}

export async function signedInvoiceUrl(db: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Emails the invoice to the customer. Only ever called when someone asks for it. */
export async function sendServiceInvoice(db: SupabaseClient, invoiceId: string, to?: string): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
  const { data } = await db.from("service_invoices").select("*").eq("id", invoiceId).maybeSingle();
  const inv = data as Row | null;
  if (!inv || !inv.pdf_path) return { ok: false, error: "Invoice not found." };
  const { data: file, error } = await db.storage.from(BUCKET).download(inv.pdf_path);
  if (error || !file) return { ok: false, error: "Couldn't read the invoice file." };
  const recipient = (to ?? inv.customer_email ?? "").trim();
  if (!recipient) return { ok: false, error: "No email address for this customer." };
  const text = [
    `Hi ${(inv.customer_name ?? "").split(/\s+/)[0] || "there"},`,
    `Please find your tax invoice ${inv.invoice_number} attached, for ₹${inv.amount_inr.toLocaleString("en-IN")} (GST included).`,
    "Regards,\nStaffAnchor Talent Solutions\ninfo@staffanchor.com | 7273000088",
  ].join("\n\n");
  try {
    await sendEmail({
      to: recipient,
      cc: PRO_CC,
      subject: `Tax Invoice ${inv.invoice_number} | StaffAnchor`,
      text,
      html: invoiceEmailHtml(text),
      fromName: "StaffAnchor",
      fromEmail: PRO_FROM,
      replyTo: PRO_FROM,
      attachments: [{ filename: `Tax Invoice ${inv.invoice_number.replace(/\//g, "-")}.pdf`, content: Buffer.from(await file.arrayBuffer()), contentType: "application/pdf" }],
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
  await db.from("service_invoices").update({ sent_at: new Date().toISOString(), sent_to: recipient }).eq("id", invoiceId);
  return { ok: true, sentTo: recipient };
}
