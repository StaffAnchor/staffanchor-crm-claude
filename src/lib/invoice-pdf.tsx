import path from "path";
import { Document, Page, Text, View, Font, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

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
const BORDER = "#000000";

const styles = StyleSheet.create({
  page: { fontSize: 8.6, fontFamily: "Inter", color: INK, padding: 24 },
  outer: { borderWidth: 1, borderColor: BORDER },
  titleBar: { borderBottomWidth: 1, borderColor: BORDER, paddingVertical: 6, alignItems: "center" },
  titleText: { fontSize: 13, fontWeight: 700, letterSpacing: 1 },

  row: { flexDirection: "row" },
  colBorderRight: { borderRightWidth: 1, borderColor: BORDER },
  cellBorderBottom: { borderBottomWidth: 1, borderColor: BORDER },
  pad: { padding: 6 },

  partyCol: { flex: 1.4 },
  metaCol: { flex: 1 },

  label: { fontSize: 7.4, fontWeight: 600, color: "#334155", marginBottom: 2 },
  companyName: { fontSize: 10, fontWeight: 700, marginBottom: 3 },
  bodyText: { fontSize: 8.4, lineHeight: 1.45 },
  smallText: { fontSize: 7.6, lineHeight: 1.4, color: "#1E293B" },

  metaRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER },
  metaCell: { flex: 1, padding: 5, borderRightWidth: 1, borderColor: BORDER },
  metaCellLast: { flex: 1, padding: 5 },
  metaLabel: { fontSize: 6.8, color: "#475569", marginBottom: 2, textTransform: "uppercase" },
  metaValue: { fontSize: 8.2, fontWeight: 600 },

  table: { borderTopWidth: 1, borderColor: BORDER },
  thRow: { flexDirection: "row", backgroundColor: "#EEF1F5", borderBottomWidth: 1, borderColor: BORDER },
  trRow: { flexDirection: "row", borderBottomWidth: 1, borderColor: BORDER, minHeight: 20 },
  th: { fontSize: 7.2, fontWeight: 700, padding: 5, borderRightWidth: 1, borderColor: BORDER },
  td: { fontSize: 8, padding: 5, borderRightWidth: 1, borderColor: BORDER },

  totalsBlock: { alignSelf: "flex-end", width: 240, marginTop: 0 },
  totalsRow: { flexDirection: "row", borderTopWidth: 1, borderColor: BORDER },
  totalsLabel: { flex: 1, fontSize: 8, padding: 5, fontWeight: 600, borderRightWidth: 1, borderColor: BORDER },
  totalsValue: { width: 90, fontSize: 8, padding: 5, textAlign: "right" },
  grandRow: { backgroundColor: "#EEF1F5" },
  grandText: { fontWeight: 700 },

  footerRow: { flexDirection: "row", borderTopWidth: 1, borderColor: BORDER },
  footerCol: { flex: 1, padding: 8 },
  footerColBorder: { borderRightWidth: 1, borderColor: BORDER },
  footerHeading: { fontSize: 7.6, fontWeight: 700, marginBottom: 5, textTransform: "uppercase" },
  amountWords: { padding: 6, borderTopWidth: 1, borderColor: BORDER, fontSize: 8, fontWeight: 600 },
  signBlock: { marginTop: 26, alignItems: "center" },
  signLine: { fontSize: 7.6, color: "#475569" },
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
};

export type InvoicePdfLineItem = {
  candidateName: string;
  designation: string;
  location: string | null;
  dateOfJoining: string | null; // ISO
  billingAmount: number; // pre-GST
};

export type InvoicePdfInput = {
  kind: "proforma" | "final";
  invoiceNumber: string;
  invoiceDate: Date;
  client: InvoicePdfClient;
  item: InvoicePdfLineItem;
};

function fmtDate(d: string | Date | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function InvoiceDocument({ input }: { input: InvoicePdfInput }) {
  ensureFonts();
  const { kind, invoiceNumber, invoiceDate, client, item } = input;
  const taxable = item.billingAmount;
  const { cgst, sgst, igst, gstTotal } = gstSplit(taxable, client.stateCode);
  const total = round2(taxable + gstTotal);
  const title = kind === "proforma" ? "PROFORMA INVOICE" : "TAX INVOICE";

  return (
    <Document title={`${title} ${invoiceNumber} - ${client.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.outer}>
          <View style={styles.titleBar}>
            <Text style={styles.titleText}>{title}</Text>
          </View>

          {/* Meta strip: invoice no / date / place of supply */}
          <View style={styles.metaRow}>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Invoice No.</Text>
              <Text style={styles.metaValue}>{invoiceNumber}</Text>
            </View>
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Invoice Date</Text>
              <Text style={styles.metaValue}>{fmtDate(invoiceDate)}</Text>
            </View>
            <View style={styles.metaCellLast}>
              <Text style={styles.metaLabel}>Place of Supply</Text>
              <Text style={styles.metaValue}>{client.stateCode === STAFFANCHOR.stateCode ? "Uttar Pradesh (09)" : "Out of State"}</Text>
            </View>
          </View>

          {/* Vendor / Recipient two-column block */}
          <View style={[styles.row, styles.cellBorderBottom]}>
            <View style={[styles.partyCol, styles.colBorderRight, styles.pad]}>
              <Text style={styles.label}>Vendor / Supplier Details</Text>
              <Text style={styles.companyName}>{STAFFANCHOR.name}</Text>
              <Text style={styles.smallText}>{STAFFANCHOR.address}</Text>
              <Text style={styles.smallText}>Phone: {STAFFANCHOR.phone} | Email: {STAFFANCHOR.email}</Text>
              <Text style={styles.smallText}>GSTIN: {STAFFANCHOR.gstin}</Text>
              <Text style={styles.smallText}>PAN: {STAFFANCHOR.pan}</Text>
            </View>
            <View style={[styles.partyCol, styles.pad]}>
              <Text style={styles.label}>Recipient Details</Text>
              <Text style={styles.companyName}>{client.name}</Text>
              {client.billingAddress ? <Text style={styles.smallText}>{client.billingAddress}</Text> : null}
              <Text style={styles.smallText}>GSTIN: {client.gstin ?? "—"}</Text>
            </View>
          </View>

          {/* Line-item table */}
          <View style={styles.table}>
            <View style={styles.thRow}>
              <Text style={[styles.th, { width: 26 }]}>Sr.</Text>
              <Text style={[styles.th, { flex: 1.6 }]}>Candidate Full Name</Text>
              <Text style={[styles.th, { flex: 1.3 }]}>Designation</Text>
              <Text style={[styles.th, { width: 68 }]}>Date of Joining</Text>
              <Text style={[styles.th, { flex: 1 }]}>Location</Text>
              <Text style={[styles.th, { width: 80, borderRightWidth: 0 }]}>Billing Amount</Text>
            </View>
            <View style={styles.trRow}>
              <Text style={[styles.td, { width: 26 }]}>1</Text>
              <Text style={[styles.td, { flex: 1.6 }]}>{item.candidateName}</Text>
              <Text style={[styles.td, { flex: 1.3 }]}>{item.designation}</Text>
              <Text style={[styles.td, { width: 68 }]}>{fmtDate(item.dateOfJoining)}</Text>
              <Text style={[styles.td, { flex: 1 }]}>{item.location ?? "—"}</Text>
              <Text style={[styles.td, { width: 80, borderRightWidth: 0, textAlign: "right" }]}>{inr(taxable)}</Text>
            </View>
          </View>

          {/* Totals */}
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Total Before Tax</Text>
              <Text style={styles.totalsValue}>{inr(taxable)}</Text>
            </View>
            {cgst > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>CGST @ 9%</Text>
                <Text style={styles.totalsValue}>{inr(cgst)}</Text>
              </View>
            )}
            {sgst > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>SGST @ 9%</Text>
                <Text style={styles.totalsValue}>{inr(sgst)}</Text>
              </View>
            )}
            {igst > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>IGST @ 18%</Text>
                <Text style={styles.totalsValue}>{inr(igst)}</Text>
              </View>
            )}
            <View style={[styles.totalsRow, styles.grandRow]}>
              <Text style={[styles.totalsLabel, styles.grandText]}>Total After Tax</Text>
              <Text style={[styles.totalsValue, styles.grandText]}>{inr(total)}</Text>
            </View>
          </View>

          <View style={styles.amountWords}>
            <Text>Amount in Words: {amountInWords(total)}</Text>
          </View>

          {/* Bank details vs signature */}
          <View style={styles.footerRow}>
            <View style={[styles.footerCol, styles.footerColBorder]}>
              <Text style={styles.footerHeading}>Bank Details</Text>
              <Text style={styles.smallText}>Bank: {STAFFANCHOR.bank.name}</Text>
              <Text style={styles.smallText}>Account Name: {STAFFANCHOR.bank.accountHolder}</Text>
              <Text style={styles.smallText}>Account No.: {STAFFANCHOR.bank.accountNo}</Text>
              <Text style={styles.smallText}>IFSC: {STAFFANCHOR.bank.ifsc}</Text>
              {kind === "final" && <Text style={[styles.smallText, { marginTop: 5 }]}>Payment Status: Received</Text>}
            </View>
            <View style={[styles.footerCol, { alignItems: "center" }]}>
              <Text style={styles.footerHeading}>For {STAFFANCHOR.name}</Text>
              <View style={styles.signBlock}>
                <Text style={styles.signLine}>Authorized Signatory</Text>
              </View>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument input={input} />);
}
