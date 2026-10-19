import path from "path";
import { Document, Page, Text, View, Image, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { GST_STATES } from "@/lib/gst";

// StaffAnchor's own system-generated Proforma / Tax Invoice, modelled on the
// "black-box grid" template the firm already uses for client People
// Interactive (see TAX INVOICE FORMAT - for Ahmedabad/Delhi.docx and the
// matching Proforma #11 / Tax Invoice #18 pair) -- per the user's explicit
// "match your template exactly" scoping answer, this is the one reusable
// bordered-grid layout rather than the colourful gradient template, since
// that's the format the uploaded sample proforma invoice used.
//
// GST logic (confirmed from real invoices): same state as StaffAnchor (UP,
// code 09) -> CGST 9% + SGST 9%; different state -> IGST 18% single line.

export const GST_RATE = 0.18;
export const SAC = "998512"; // recruitment / placement services
export const STAFFANCHOR = {
  name: "StaffAnchor Talent Solutions Private Limited",
  address: "PLOT NO 21 and 21A MR-1 AltF Sector 142, Noida, Uttar Pradesh 201304",
  phone: "9818881142",
  email: "info@staffanchor.com",
  gstin: "09ABNCS7867A1ZU",
  pan: "ABNCS7867A",
  stateCode: "09",
  bank: {
    name: "AXIS BANK, SECTOR FORTY FIVE NOIDA",
    accountNo: "923020056990700",
    ifsc: "UTIB0004491",
    accountHolder: "Staffanchor Talent Solutions Private Limited",
  },
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gstSplit(taxableAmount: number, clientStateCode: string | null) {
  const gstTotal = round2(taxableAmount * GST_RATE);
  if (clientStateCode && clientStateCode === STAFFANCHOR.stateCode) {
    const half = round2(gstTotal / 2);
    return { cgst: half, sgst: round2(gstTotal - half), igst: 0, gstTotal };
  }
  return { cgst: 0, sgst: 0, igst: gstTotal, gstTotal };
}

// Indian financial year, April->March, e.g. 9 Sep 2026 -> "2026-27".
export function financialYearLabel(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function invoicePrefix(kind: "proforma" | "final", d: Date = new Date()): string {
  const infix = kind === "proforma" ? "PI" : "INV";
  return `SA/${infix}/${financialYearLabel(d)}/`;
}

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let fontsRegistered = false;
function ensureFonts() {
  if (fontsRegistered) return;
  fontsRegistered = true;
  Font.register({
    family: "Inter",
    fonts: [
      { src: path.join(FONT_DIR, "Inter-Regular.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Inter-Medium.woff"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Inter-SemiBold.woff"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Inter-Bold.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#CBD5E1";
const BRAND = "#1E4FA8";
const LOGO = path.join(process.cwd(), "public", "staffanchor-logo-pdf.png");
const STAMP = path.join(process.cwd(), "public", "invoice-stamp-signature.png");

const styles = StyleSheet.create({
  page: { fontSize: 8.6, fontFamily: "Inter", color: INK, padding: 34, paddingBottom: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: 10, borderBottomWidth: 1.5, borderColor: BRAND },
  logo: { width: 92, height: 54, objectFit: "contain" },
  co: { fontSize: 12, fontWeight: 700 },
  coLine: { fontSize: 8, color: "#334155", lineHeight: 1.5 },
  titleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 12 },
  title: { fontSize: 20, fontWeight: 700, color: BRAND },
  note: { fontSize: 7.4, color: MUTED, marginTop: 2 },
  metaBox: { alignItems: "flex-end" },
  metaLine: { fontSize: 8.4, lineHeight: 1.6 },
  metaKey: { color: MUTED },
  billRow: { flexDirection: "row", marginTop: 14, gap: 18 },
  billCol: { flex: 1 },
  sectionLabel: { fontSize: 7.2, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  party: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  text: { fontSize: 8.4, lineHeight: 1.5, color: "#1E293B" },

  table: { marginTop: 16, borderWidth: 1, borderColor: LINE },
  thRow: { flexDirection: "row", backgroundColor: "#EEF3FB", borderBottomWidth: 1, borderColor: LINE },
  trRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: LINE },
  th: { fontSize: 7.4, fontWeight: 700, padding: 6, color: BRAND },
  td: { fontSize: 8.4, padding: 6 },
  desc: { fontSize: 8.4, fontWeight: 600, lineHeight: 1.4 },
  descSub: { fontSize: 7.6, color: MUTED, marginTop: 2, lineHeight: 1.4 },

  lower: { flexDirection: "row", marginTop: 12, gap: 20 },
  lowerLeft: { flex: 1.1 },
  totals: { flex: 1 },
  tRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3.5, paddingHorizontal: 6 },
  tGrand: { backgroundColor: BRAND, marginTop: 3, borderRadius: 2 },
  tGrandText: { color: "#FFFFFF", fontWeight: 700, fontSize: 10 },
  words: { fontSize: 8.6, fontWeight: 600, marginTop: 2, lineHeight: 1.4 },

  foot: { flexDirection: "row", marginTop: 18, gap: 20, borderTopWidth: 1, borderColor: LINE, paddingTop: 12 },
  footCol: { flex: 1 },
  sign: { alignItems: "center" },
  stamp: { width: 120, height: 98, objectFit: "contain", marginTop: 2 },
  signLine: { fontSize: 7.8, color: "#334155", fontWeight: 600 },
  paid: { marginTop: 6, fontSize: 8.4, fontWeight: 700, color: "#15803D" },
});

// Basic Indian-numbering amount-in-words (rupees only, no paise), enough
// fidelity for a generated invoice's "Amount in words" line.
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const rest = n % 100;
  return `${ONES[Math.floor(n / 100)]} Hundred${rest ? " " + twoDigits(rest) : ""}`;
}
export function amountInWords(n: number): string {
  const num = Math.round(n);
  if (num === 0) return "Zero Rupees Only";
  const crore = Math.floor(num / 10000000);
  const lakh = Math.floor((num % 10000000) / 100000);
  const thousand = Math.floor((num % 100000) / 1000);
  const hundred = num % 1000;
  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));
  return `${parts.join(" ")} Rupees Only`;
}

function inr(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

export type InvoicePdfClient = {
  name: string;
  gstin: string | null;
  billingAddress: string | null;
  stateCode: string | null;
  stateName?: string | null;
};

export type InvoicePdfLineItem = {
  candidateName: string;
  designation: string;
  location: string | null;
  dateOfJoining: string | null; // ISO
  billingAmount: number; // pre-GST
  description?: string | null; // overrides the auto line text
  commissionPct?: number | null;
  annualCtc?: number | null; // rupees
};

export type InvoicePdfInput = {
  kind: "proforma" | "final";
  invoiceNumber: string;
  invoiceDate: Date;
  dueDate?: Date | null; // proforma only
  proformaRef?: { number: string; date: Date | null } | null; // tax invoice raised against a proforma
  client: InvoicePdfClient;
  item: InvoicePdfLineItem;
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" });
}

function inLakhs(n: number): string {
  const l = n / 100000;
  return `${Number.isInteger(l) ? l : l.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}L`;
}

// Same wording the firm's Zoho invoices use: name, hired for a full-time
// role, commission % of annual CTC, joining date.
export function defaultLineText(item: InvoicePdfLineItem): { title: string; sub: string } {
  if (item.description && item.description.trim()) return { title: item.description.trim(), sub: "" };
  const bits = [`${item.candidateName} (Hired for Full-time role)`];
  if (item.commissionPct) {
    bits.push(`Commission of ${Number(item.commissionPct.toFixed(2))}% of the Annual CTC${item.annualCtc ? ` (${inLakhs(item.annualCtc)})` : ""}`);
  }
  if (item.dateOfJoining) bits.push(`Joined on ${fmtDate(item.dateOfJoining)}`);
  const sub = [item.designation, item.location].filter(Boolean).join(" · ");
  return { title: bits.join(" - "), sub };
}

function InvoiceDocument({ input }: { input: InvoicePdfInput }) {
  ensureFonts();
  const { kind, invoiceNumber, invoiceDate, dueDate, proformaRef, client, item } = input;
  const taxable = item.billingAmount;
  const { cgst, sgst, igst, gstTotal } = gstSplit(taxable, client.stateCode);
  const exact = round2(taxable + gstTotal);
  const total = Math.round(exact);
  const rounding = round2(total - exact);
  const title = kind === "proforma" ? "Proforma Invoice" : "Tax Invoice";
  const supply = client.stateCode ? `${client.stateName ?? GST_STATES[client.stateCode] ?? ""} (${client.stateCode})`.trim() : "—";
  const intra = !!client.stateCode && client.stateCode === STAFFANCHOR.stateCode;
  const line = defaultLineText(item);
  const taxLabel = intra ? "CGST 9% + SGST 9%" : "IGST 18%";

  return (
    <Document title={`${title} ${invoiceNumber} - ${client.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.co}>StaffAnchor Talent Solutions</Text>
            <Text style={styles.coLine}>{STAFFANCHOR.name}</Text>
            <Text style={styles.coLine}>{STAFFANCHOR.address}</Text>
            <Text style={styles.coLine}>GSTIN {STAFFANCHOR.gstin} · PAN {STAFFANCHOR.pan}</Text>
            <Text style={styles.coLine}>{STAFFANCHOR.email} · {STAFFANCHOR.phone}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO} style={styles.logo} />
        </View>

        <View style={styles.titleRow}>
          <View>
            <Text style={styles.title}>{title}</Text>
            {kind === "proforma" && <Text style={styles.note}>Not a tax invoice. A Tax Invoice is issued once payment is received.</Text>}
            {kind === "final" && proformaRef && (
              <Text style={styles.note}>Against Proforma Invoice {proformaRef.number}{proformaRef.date ? ` dated ${fmtDate(proformaRef.date)}` : ""}</Text>
            )}
          </View>
          <View style={styles.metaBox}>
            <Text style={styles.metaLine}><Text style={styles.metaKey}>Invoice No.  </Text><Text style={{ fontWeight: 700 }}>{invoiceNumber}</Text></Text>
            <Text style={styles.metaLine}><Text style={styles.metaKey}>Date  </Text>{fmtDate(invoiceDate)}</Text>
            {kind === "proforma" && dueDate && <Text style={styles.metaLine}><Text style={styles.metaKey}>Due by  </Text>{fmtDate(dueDate)}</Text>}
            <Text style={styles.metaLine}><Text style={styles.metaKey}>Place of supply  </Text>{supply}</Text>
          </View>
        </View>

        <View style={styles.billRow}>
          <View style={styles.billCol}>
            <Text style={styles.sectionLabel}>Bill to</Text>
            <Text style={styles.party}>{client.name}</Text>
            {client.billingAddress ? <Text style={styles.text}>{client.billingAddress}</Text> : null}
            <Text style={styles.text}>GSTIN {client.gstin ?? "—"}</Text>
            {client.stateCode ? <Text style={styles.text}>State: {supply}</Text> : null}
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.thRow}>
            <Text style={[styles.th, { width: 24 }]}>#</Text>
            <Text style={[styles.th, { flex: 1 }]}>Item &amp; description</Text>
            <Text style={[styles.th, { width: 50 }]}>HSN/SAC</Text>
            <Text style={[styles.th, { width: 28, textAlign: "right" }]}>Qty</Text>
            <Text style={[styles.th, { width: 66, textAlign: "right" }]}>Rate</Text>
            <Text style={[styles.th, { width: 70, textAlign: "right" }]}>Amount</Text>
          </View>
          <View style={[styles.trRow, { borderBottomWidth: 0 }]}>
            <Text style={[styles.td, { width: 24 }]}>1</Text>
            <View style={[styles.td, { flex: 1 }]}>
              <Text style={styles.desc}>{line.title}</Text>
              {line.sub ? <Text style={styles.descSub}>{line.sub}</Text> : null}
            </View>
            <Text style={[styles.td, { width: 50 }]}>{SAC}</Text>
            <Text style={[styles.td, { width: 28, textAlign: "right" }]}>1</Text>
            <Text style={[styles.td, { width: 66, textAlign: "right" }]}>{inr(taxable)}</Text>
            <Text style={[styles.td, { width: 70, textAlign: "right" }]}>{inr(taxable)}</Text>
          </View>
        </View>

        <View style={styles.lower}>
          <View style={styles.lowerLeft}>
            <Text style={styles.sectionLabel}>Total in words</Text>
            <Text style={styles.words}>{amountInWords(total)}</Text>
            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>Notes</Text>
            <Text style={styles.text}>
              {kind === "proforma"
                ? `Please pay ${dueDate ? "by " + fmtDate(dueDate) : "within 7 days"} to the account below, quoting ${invoiceNumber}.`
                : "Thank you for your business."}
            </Text>
          </View>
          <View style={styles.totals}>
            <View style={styles.tRow}><Text>Sub total</Text><Text>{inr(taxable)}</Text></View>
            {cgst > 0 && <View style={styles.tRow}><Text>CGST (9%)</Text><Text>{inr(cgst)}</Text></View>}
            {sgst > 0 && <View style={styles.tRow}><Text>SGST (9%)</Text><Text>{inr(sgst)}</Text></View>}
            {igst > 0 && <View style={styles.tRow}><Text>IGST (18%)</Text><Text>{inr(igst)}</Text></View>}
            {rounding !== 0 && <View style={styles.tRow}><Text>Rounding</Text><Text>{inr(rounding)}</Text></View>}
            <View style={[styles.tRow, styles.tGrand]}><Text style={styles.tGrandText}>Total</Text><Text style={styles.tGrandText}>₹{inr(total)}</Text></View>
            {kind === "final" && (
              <>
                <View style={styles.tRow}><Text>Payment received</Text><Text>₹{inr(total)}</Text></View>
                <View style={styles.tRow}><Text style={{ fontWeight: 700 }}>Balance due</Text><Text style={{ fontWeight: 700 }}>₹0.00</Text></View>
              </>
            )}
            <Text style={[styles.note, { textAlign: "right", marginTop: 4 }]}>{taxLabel} on SAC {SAC}</Text>
          </View>
        </View>

        <View style={styles.foot} wrap={false}>
          <View style={styles.footCol}>
            <Text style={styles.sectionLabel}>Pay to</Text>
            <Text style={styles.text}>{STAFFANCHOR.bank.accountHolder}</Text>
            <Text style={styles.text}>{STAFFANCHOR.bank.name}</Text>
            <Text style={styles.text}>A/C {STAFFANCHOR.bank.accountNo}</Text>
            <Text style={styles.text}>IFSC {STAFFANCHOR.bank.ifsc}</Text>
            {kind === "final" && <Text style={styles.paid}>PAID</Text>}
          </View>
          <View style={[styles.footCol, styles.sign]}>
            <Text style={styles.signLine}>For {STAFFANCHOR.name}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={STAMP} style={styles.stamp} />
            <Text style={styles.signLine}>Authorized Signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument input={input} />);
}
