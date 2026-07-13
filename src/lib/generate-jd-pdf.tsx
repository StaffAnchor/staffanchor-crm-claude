import path from "path";
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";

// Same client-confidentiality rule as the public listing (see the
// public.get_open_job_listing SQL function: `case when show_client_name
// then client_name else coalesce(public_client_label, 'A confidential
// client') end`) -- a JD PDF is meant to be forwarded to candidates who
// aren't logged into anything, so it must never leak a hidden client name.
export function clientDisplayName(mandate: {
  client_name: string | null;
  show_client_name: boolean | null;
  public_client_label: string | null;
}): string {
  if (mandate.show_client_name !== false) return mandate.client_name ?? "A confidential client";
  return mandate.public_client_label?.trim() || "A confidential client";
}

export type JdPdfMandate = {
  role_title: string;
  client_name: string | null;
  show_client_name: boolean | null;
  public_client_label: string | null;
  category: string | null;
  sub_domain: string | null;
  sub_domains: string[] | null;
  city: string | null;
  cities: string[] | null;
  budget_min: number | null;
  budget_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
  work_mode: string | null;
  jd_overview: string | null;
  jd_responsibilities: string | null;
  jd_candidate_profile: string | null;
  jd_compensation_benefits: string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
};

function lines(value: string | null): string[] {
  return (value ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// The standard 14 PDF fonts (Helvetica included) have no glyph for "₹", so
// it renders as a missing-glyph box -- spell out "Rs." instead of pulling in
// a custom font just for one symbol.
function budgetLabel(min: number | null, max: number | null): string | null {
  if (!min && !max) return null;
  if (min && max && min !== max) return `Rs. ${min}–${max} LPA`;
  return `Rs. ${min ?? max} LPA`;
}

function experienceLabel(min: number | null, max: number | null): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min !== max) return `${min}–${max} yrs`;
  return `${min ?? max} yrs`;
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontSize: 10.5, fontFamily: "Helvetica", color: "#1e293b" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18, borderBottomWidth: 1.5, borderBottomColor: "#2563eb", paddingBottom: 14 },
  logo: { width: 74, height: 74 },
  title: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  subtitle: { fontSize: 11, color: "#475569", marginTop: 3 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  metaChip: { backgroundColor: "#eff6ff", color: "#1d4ed8", borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8, fontSize: 9.5, fontWeight: 700 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontWeight: 700, color: "#0f172a", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  paragraph: { lineHeight: 1.5, color: "#334155" },
  bulletRow: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, color: "#2563eb" },
  bulletText: { flex: 1, lineHeight: 1.5, color: "#334155" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8.5, color: "#94a3b8", textAlign: "center", borderTopWidth: 0.5, borderTopColor: "#e2e8f0", paddingTop: 8 },
});

function Bullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{"•"}</Text>
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </>
  );
}

function JdDocument({ mandate }: { mandate: JdPdfMandate }) {
  const clientDisplay = clientDisplayName(mandate);
  const cities = mandate.cities?.length ? mandate.cities : mandate.city ? [mandate.city] : [];
  const subDomains = mandate.sub_domains?.length ? mandate.sub_domains : mandate.sub_domain ? [mandate.sub_domain] : [];
  const budget = budgetLabel(mandate.budget_min, mandate.budget_max);
  const experience = experienceLabel(mandate.experience_min, mandate.experience_max);
  const logoPath = path.join(process.cwd(), "public", "staffanchor-logo-pdf.png");

  return (
    <Document title={`JD - ${mandate.role_title} - ${clientDisplay}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Job Description for {mandate.role_title}</Text>
            <Text style={styles.subtitle}>Client: {clientDisplay}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- this is react-pdf's own Image primitive (renders into the PDF), not an HTML <img>; it has no alt prop. */}
          <Image src={logoPath} style={styles.logo} />
        </View>

        <View style={styles.metaRow}>
          {mandate.category && <Text style={styles.metaChip}>{CATEGORY_LABEL[mandate.category] ?? mandate.category}</Text>}
          {subDomains.map((sd) => (
            <Text key={sd} style={styles.metaChip}>{sd}</Text>
          ))}
          {cities.length > 0 && <Text style={styles.metaChip}>{cities.join(", ")}</Text>}
          {experience && <Text style={styles.metaChip}>{experience} experience</Text>}
          {budget && <Text style={styles.metaChip}>{budget}</Text>}
          {mandate.work_mode && <Text style={styles.metaChip}>{mandate.work_mode}</Text>}
        </View>

        {mandate.jd_overview && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Overview</Text>
            <Text style={styles.paragraph}>{mandate.jd_overview}</Text>
          </View>
        )}

        {lines(mandate.jd_responsibilities).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Key Responsibilities</Text>
            <Bullets items={lines(mandate.jd_responsibilities)} />
          </View>
        )}

        {lines(mandate.jd_candidate_profile).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Candidate Profile</Text>
            <Bullets items={lines(mandate.jd_candidate_profile)} />
          </View>
        )}

        {(mandate.must_haves?.length || mandate.good_to_haves?.length) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What We&apos;re Looking For</Text>
            <Bullets items={(mandate.must_haves ?? []).map((m) => `Must have: ${m}`)} />
            <Bullets items={(mandate.good_to_haves ?? []).map((g) => `Good to have: ${g}`)} />
          </View>
        ) : null}

        {lines(mandate.jd_compensation_benefits).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Compensation &amp; Benefits</Text>
            <Bullets items={lines(mandate.jd_compensation_benefits)} />
          </View>
        )}

        <Text style={styles.footer} fixed>
          Shared by StaffAnchor {"•"} www.staffanchor.com {"•"} This document is provided for candidate reference and may be updated by the client at any time.
        </Text>
      </Page>
    </Document>
  );
}

export async function renderJdPdf(mandate: JdPdfMandate): Promise<Buffer> {
  return renderToBuffer(<JdDocument mandate={mandate} />);
}
