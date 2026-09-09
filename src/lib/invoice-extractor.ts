import { generateTextWithFallback } from "@/lib/ai-providers";
import { extractPdfText } from "@/lib/resume-text";

// Parses a single historical invoice PDF into structured billing fields so
// 1.5-2 years of pre-CRM invoicing (issued before placement_fee_tranches
// existed) can be imported for month-on-month / annual gross vs net
// reporting. Mirrors the practice-classifier pattern: extract text, prompt
// the AI fallback chain for strict JSON, validate before trusting anything.
//
// Deliberately conservative about `needs_review` -- a missing or
// unparseable amount/date/client name is exactly the kind of silent error
// that would corrupt a billing rollup, so those get flagged for a human to
// fix rather than defaulted to zero/null and left invisible.

export type ExtractedInvoiceFields = {
  client_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null; // ISO yyyy-mm-dd
  gross_amount: number | null;
  gst_amount: number | null;
  net_amount: number | null;
};

export type InvoiceExtractionResult =
  | { ok: true; fields: ExtractedInvoiceFields; needsReview: boolean; rawText: string }
  | { ok: false; error: string };

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  return null;
}

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const cleaned = v.replace(/[,₹\s]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function toIsoDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function extractInvoiceFromPdf(buffer: ArrayBuffer): Promise<InvoiceExtractionResult> {
  const text = await extractPdfText(buffer);
  if (!text || !text.trim()) {
    return { ok: false, error: "Could not extract any text from this PDF (scanned image with no OCR layer?)" };
  }

  const prompt = `You are extracting billing data from a recruiting agency's invoice PDF (raw extracted text below -- layout/spacing may be jumbled).

Invoice text:
${text.slice(0, 6000)}

Extract these fields:
- client_name: the company being billed (NOT the recruiting agency issuing the invoice)
- invoice_number: the invoice number/ID as printed
- invoice_date: the invoice date, as ISO yyyy-mm-dd (best guess if format is ambiguous)
- gross_amount: the total invoice amount INCLUDING GST/tax, as a plain number (no currency symbols or commas)
- gst_amount: the GST/tax amount alone, as a plain number. If the invoice shows a GST rate (e.g. 18%) instead of an amount, compute it.
- net_amount: the amount EXCLUDING GST/tax (gross minus GST), as a plain number

If a field genuinely cannot be determined from the text, use null for it -- do not guess or fabricate a value.

Return ONLY a JSON object, no markdown fence, no commentary:
{"client_name": "...", "invoice_number": "...", "invoice_date": "...", "gross_amount": 0, "gst_amount": 0, "net_amount": 0}`;

  let raw: string;
  try {
    const result = await generateTextWithFallback(prompt);
    raw = result.text;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseJsonObject(raw);
  if (!parsed) return { ok: false, error: "Could not parse AI response as JSON" };

  const fields: ExtractedInvoiceFields = {
    client_name: typeof parsed.client_name === "string" && parsed.client_name.trim() ? parsed.client_name.trim() : null,
    invoice_number:
      typeof parsed.invoice_number === "string" && parsed.invoice_number.trim() ? parsed.invoice_number.trim() : null,
    invoice_date: toIsoDate(parsed.invoice_date),
    gross_amount: toNumber(parsed.gross_amount),
    gst_amount: toNumber(parsed.gst_amount),
    net_amount: toNumber(parsed.net_amount),
  };

  // Fill in whichever one of gross/gst/net is missing if the other two are present.
  if (fields.gross_amount == null && fields.net_amount != null && fields.gst_amount != null) {
    fields.gross_amount = Math.round((fields.net_amount + fields.gst_amount) * 100) / 100;
  } else if (fields.net_amount == null && fields.gross_amount != null && fields.gst_amount != null) {
    fields.net_amount = Math.round((fields.gross_amount - fields.gst_amount) * 100) / 100;
  } else if (fields.gst_amount == null && fields.gross_amount != null && fields.net_amount != null) {
    fields.gst_amount = Math.round((fields.gross_amount - fields.net_amount) * 100) / 100;
  }

  const needsReview =
    !fields.client_name || !fields.invoice_date || fields.gross_amount == null || fields.net_amount == null;

  return { ok: true, fields, needsReview, rawText: text };
}
