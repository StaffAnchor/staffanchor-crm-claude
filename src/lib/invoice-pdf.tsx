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

// Short financial-year tag, e.g. 9 Sep 2026 -> "26-27". Invoice numbers stay
// within GST's 16-character limit: SAPI/26-27/002, SAINV/26-27/001.
export function fyShort(d: Date = new Date()): string {
  return financialYearLabel(d).replace(/^20/, "");
}

export function invoicePrefix(kind: "proforma" | "final", d: Date = new Date()): string {
  return `${kind === "proforma" ? "SAPI" : "SAINV"}/${fyShort(d)}/`;
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
  // Hind carries the rupee sign (Inter's subset doesn't) and is close to the
  // look of the firm's existing invoices.
  Font.register({
    family: "Hind",
    fonts: [
      { src: path.join(FONT_DIR, "Hind-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Hind-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Hind-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Hind-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
}

const INK = "#111111";
const PURPLE = "#9B8FE6";
const LOGO = path.join(process.cwd(), "public", "staffanchor-logo-pdf.png");
const STAMP = path.join(process.cwd(), "public", "invoice-stamp-signature.png");

// Layout copied from the firm's existing Proforma / Tax Invoice PDFs
// (purple header band, company block + logo, Bill To / Invoice Details,
// Pay To + signature).
const styles = StyleSheet.create({
  page: { fontSize: 9.6, fontFamily: "Hind", color: INK, paddingTop: 34, paddingHorizontal: 33, paddingBottom: 34 },
  head: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: PURPLE, paddingBottom: 8 },
  co: { fontSize: 15, fontWeight: 700, marginBottom: 4 },
  coLine: { fontSize: 9, lineHeight: 1.55 },
  logo: { width: 78, height: 46, objectFit: "contain", marginTop: 8 },
  title: { textAlign: "center", color: PURPLE, fontSize: 18, fontWeight: 700, marginTop: 12, marginBottom: 14 },
  two: { flexDirection: "row", justifyContent: "space-between" },
  bold: { fontWeight: 700, fontSize: 9.4 },
  lineText: { fontSize: 9.4, lineHeight: 1.5 },
  right: { textAlign: "right" },

  thRow: { flexDirection: "row", backgroundColor: PURPLE, marginTop: 8 },
  th: { color: "#FFFFFF", fontWeight: 700, fontSize: 9, paddingVertical: 4, paddingHorizontal: 5 },
  tr: { flexDirection: "row", paddingVertical: 6 },
  td: { fontSize: 9, paddingHorizontal: 5 },
  totalRow: { flexDirection: "row", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#888888", paddingVertical: 4 },

  lower: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  lowerL: { width: 250 },
  lowerR: { width: 235 },
  h: { fontWeight: 700, fontSize: 9, marginBottom: 4 },
  sRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, paddingHorizontal: 5 },
  sGrand: { backgroundColor: PURPLE },
  sGrandT: { color: "#FFFFFF", fontWeight: 700 },
  sLine: { borderBottomWidth: 1, borderColor: "#888888" },
  foot: { flexDirection: "row", justifyContent: "space-between", marginTop: 22 },
  stamp: { width: 96, height: 78, objectFit: "contain", marginTop: 4, alignSelf: "center" },
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
  paid?: boolean; // tax invoice: payment already received
  paymentMode?: string; // shown on a paid tax invoice, for example "Online (Razorpay)"
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

function fmtDateDMY(d: Date): string {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return p.replace(/\//g, "-");
}

function inLakhs(n: number): string {
  const l = n / 100000;
  return `${Number.isInteger(l) ? l : l.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}LPA`;
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
  const { kind, invoiceNumber, invoiceDate, proformaRef, client, item } = input;
  const taxable = item.billingAmount;
  const { cgst, sgst, igst, gstTotal } = gstSplit(taxable, client.stateCode);
  const exact = round2(taxable + gstTotal);
  const total = Math.round(exact);
  const rounding = round2(total - exact);
  const isProforma = kind === "proforma";
  const title = isProforma ? "Proforma Invoice" : "Tax Invoice";
  const stateName = client.stateName ?? (client.stateCode ? GST_STATES[client.stateCode] : "") ?? "";
  const supply = client.stateCode ? `${client.stateCode}-${stateName}` : "—";
  const line = defaultLineText(item);
  const received = !isProforma && input.paid ? total : 0;
  const addrLines = (client.billingAddress ?? "").split(/\n/).map((l) => l.trim()).filter(Boolean);
  const W = { n: 24, name: 180, sac: 62, qty: 46, price: 70, gst: 66 };

  return (
    <Document title={`${title} ${invoiceNumber} - ${client.name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          <View>
            <Text style={styles.co}>StaffAnchor Talent Solutions</Text>
            <Text style={styles.coLine}>{STAFFANCHOR.address.replace(/,? ?Noida.*$/, "")}, Noida</Text>
            <Text style={styles.coLine}>Phone no. : {STAFFANCHOR.phone}</Text>
            <Text style={styles.coLine}>Email : {STAFFANCHOR.email}</Text>
            <Text style={styles.coLine}>GSTIN : {STAFFANCHOR.gstin}</Text>
            <Text style={styles.coLine}>State: 09-Uttar Pradesh</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={LOGO} style={styles.logo} />
        </View>

        <Text style={styles.title}>{title}</Text>

        <View style={styles.two}>
          <View style={{ flex: 1, paddingRight: 20 }}>
            <Text style={[styles.bold, { marginBottom: 8 }]}>{isProforma ? "Proforma Invoice For" : "Bill To"}</Text>
            <Text style={[styles.bold, { marginBottom: 5 }]}>{client.name}</Text>
            {addrLines.map((l, i) => (
              <Text key={i} style={styles.lineText}>{l}</Text>
            ))}
            {client.gstin ? <Text style={[styles.lineText, { marginTop: 6 }]}>GSTIN : {client.gstin}</Text> : null}
            {client.stateCode ? <Text style={[styles.lineText, { marginTop: 6 }]}>State: {supply}</Text> : null}
          </View>
          <View style={{ width: 210 }}>
            <Text style={[styles.bold, styles.right, { marginBottom: 8 }]}>{isProforma ? "Proforma Invoice Details" : "Invoice Details"}</Text>
            <Text style={[styles.lineText, styles.right]}>{isProforma ? "Proforma Invoice No." : "Invoice No."} : {invoiceNumber}</Text>
            <Text style={[styles.lineText, styles.right]}>Date : {fmtDateDMY(invoiceDate)}</Text>
            <Text style={[styles.lineText, styles.right]}>Place of supply: {supply}</Text>
            {!isProforma && proformaRef ? (
              <Text style={[styles.lineText, styles.right]}>Against Proforma : {proformaRef.number}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.thRow}>
          <Text style={[styles.th, { width: W.n }]}>#</Text>
          <Text style={[styles.th, { width: W.name }]}>Item name</Text>
          <Text style={[styles.th, { width: W.sac }]}>HSN/ SAC</Text>
          <Text style={[styles.th, { width: W.qty, textAlign: "right" }]}>Quantity</Text>
          <Text style={[styles.th, { width: W.price, textAlign: "right" }]}>Price/ Unit</Text>
          <Text style={[styles.th, { width: W.gst, textAlign: "right" }]}>GST</Text>
          <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Amount</Text>
        </View>
        <View style={styles.tr}>
          <Text style={[styles.td, { width: W.n }]}>1</Text>
          <View style={[styles.td, { width: W.name }]}>
            <Text style={{ fontWeight: 700 }}>{line.title}</Text>
          </View>
          <Text style={[styles.td, { width: W.sac }]}>{SAC}</Text>
          <Text style={[styles.td, { width: W.qty, textAlign: "right" }]}>1</Text>
          <Text style={[styles.td, { width: W.price, textAlign: "right" }]}>₹ {inr(taxable)}</Text>
          <View style={[styles.td, { width: W.gst, alignItems: "flex-end" }]}>
            <Text>₹ {inr(gstTotal)}</Text>
            <Text style={{ fontSize: 8, color: "#444444" }}>(18%)</Text>
          </View>
          <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>₹ {inr(exact)}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={[styles.td, { width: W.n + W.name + W.sac + W.qty + W.price, fontWeight: 700 }]}>Total</Text>
          <Text style={[styles.td, { width: W.gst, textAlign: "right", fontWeight: 700 }]}>₹ {inr(gstTotal)}</Text>
          <Text style={[styles.td, { flex: 1, textAlign: "right", fontWeight: 700 }]}>₹ {inr(exact)}</Text>
        </View>

        <View style={styles.lower} wrap={false}>
          <View style={styles.lowerL}>
            <Text style={styles.h}>{isProforma ? "Proforma Invoice" : "Invoice"} Amount In Words</Text>
            <Text style={styles.lineText}>{amountInWords(total).replace(" Only", " only")}</Text>
            <Text style={[styles.h, { marginTop: 16 }]}>Terms and Conditions</Text>
            <Text style={styles.lineText}>Thanks for doing business with us!</Text>
          </View>
          <View style={styles.lowerR}>
            <View style={styles.sRow}><Text>Sub Total</Text><Text>₹ {inr(taxable)}</Text></View>
            {cgst > 0 && <View style={styles.sRow}><Text>CGST@9%</Text><Text>₹ {inr(cgst)}</Text></View>}
            {sgst > 0 && <View style={styles.sRow}><Text>SGST@9%</Text><Text>₹ {inr(sgst)}</Text></View>}
            {igst > 0 && <View style={styles.sRow}><Text>IGST@18%</Text><Text>₹ {inr(igst)}</Text></View>}
            {rounding !== 0 && <View style={styles.sRow}><Text>{isProforma ? "Round off" : "Round off"}</Text><Text>₹ {inr(Math.abs(rounding))}</Text></View>}
            <View style={[styles.sRow, styles.sGrand]}><Text style={styles.sGrandT}>Total</Text><Text style={styles.sGrandT}>₹ {inr(total)}</Text></View>
            {!isProforma && (
              <>
                <View style={styles.sRow}><Text>Received</Text><Text>₹ {inr(received)}</Text></View>
                <View style={styles.sRow}><Text>Balance</Text><Text>₹ {inr(total - received)}</Text></View>
                <View style={[styles.sRow, styles.sLine]}><Text>Payment mode</Text><Text>{input.paid ? input.paymentMode ?? "Bank transfer" : "Credit"}</Text></View>
              </>
            )}
          </View>
        </View>

        <View style={styles.foot} wrap={false}>
          <View style={{ width: 260 }}>
            <Text style={styles.h}>Pay To:</Text>
            <Text style={styles.lineText}>Bank Name : {STAFFANCHOR.bank.name}</Text>
            <Text style={styles.lineText}>Bank Account No. : {STAFFANCHOR.bank.accountNo}</Text>
            <Text style={styles.lineText}>Bank IFSC code : {STAFFANCHOR.bank.ifsc}</Text>
            <Text style={styles.lineText}>Account holder&apos;s name : {STAFFANCHOR.bank.accountHolder}</Text>
          </View>
          <View style={{ width: 200, alignItems: "center" }}>
            <Text style={styles.lineText}>For :StaffAnchor Talent Solutions</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={STAMP} style={styles.stamp} />
            <Text style={styles.bold}>Authorized Signatory</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument input={input} />);
}
