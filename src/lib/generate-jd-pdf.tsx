import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  Image,
  Svg,
  Path,
  Circle,
  Rect,
  Line,
  Polygon,
  Font,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

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

// The standard 14 PDF fonts (and the bundled Inter/Playfair Display files
// below) have no glyph for "₹", so it renders as a missing-glyph box --
// spell out "Rs." instead of pulling in yet another custom font for one
// symbol.
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

// Real Inter + Playfair Display, bundled locally as .woff (see
// public/fonts) rather than fetched from Google Fonts at render time --
// this keeps PDF generation working offline/behind firewalls and avoids a
// network round-trip on every download/email. Editorial serif for the role
// title (the one "premium" flourish), clean grotesque sans for everything
// else -- the same pairing convention used by Stripe/Notion-style
// documents rather than an all-serif or all-caps government-form look.
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
  Font.register({
    family: "Playfair Display",
    fonts: [
      { src: path.join(FONT_DIR, "PlayfairDisplay-Regular.woff"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "PlayfairDisplay-Bold.woff"), fontWeight: 700 },
      { src: path.join(FONT_DIR, "PlayfairDisplay-Italic.woff"), fontWeight: 400, fontStyle: "italic" },
    ],
  });
  // react-pdf/Yoga can't hyphenate mid-word breaks gracefully for a serif
  // display face at small container widths -- disable automatic hyphenation
  // so long single words wrap on whole-word boundaries only.
  Font.registerHyphenationCallback((word) => [word]);
}

// Restrained palette: one near-black primary, one blue accent used
// throughout for icons/checks, and the brand coral held back for a single
// tiny highlight (the "Confidential" eyebrow) -- not a navy block + bright
// red pairing.
const INK = "#0F172A";
const SLATE = "#475569";
const MUTED = "#94A3B8";
const ACCENT = "#2563EB";
const CORAL = "#E4572E";
const BORDER = "#E5E7EB";
const SURFACE = "#F8FAFC";
const WHITE = "#FFFFFF";

const styles = StyleSheet.create({
  page: { fontSize: 10, fontFamily: "Inter", color: INK, paddingTop: 44, paddingHorizontal: 46, paddingBottom: 56 },

  // -- Header ------------------------------------------------------------
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  logo: { width: 92, height: 36, objectFit: "contain" },
  headerRight: { fontSize: 8.5, color: MUTED, fontFamily: "Inter", fontWeight: 500 },
  hairline: { height: 1, backgroundColor: BORDER },

  // -- Title block ---------------------------------------------------------
  titleBlock: { marginTop: 22, marginBottom: 22 },
  eyebrow: { fontSize: 8, color: CORAL, letterSpacing: 1.3, textTransform: "uppercase", fontFamily: "Inter", fontWeight: 600, marginBottom: 10 },
  roleTitle: { fontSize: 27, fontFamily: "Playfair Display", fontWeight: 700, color: INK, lineHeight: 1.18 },
  tagRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 9 },
  tag: { fontSize: 10, color: SLATE, fontWeight: 500 },
  tagDot: { fontSize: 10, color: MUTED },
  attribution: { fontSize: 9.3, color: MUTED, marginTop: 10, lineHeight: 1.5 },
  attributionStrong: { color: SLATE, fontWeight: 600 },

  // -- Stat cards ----------------------------------------------------------
  statRow: { flexDirection: "row", gap: 10, marginBottom: 26 },
  statCard: { flex: 1, borderWidth: 1, borderColor: BORDER, borderRadius: 8, backgroundColor: WHITE, padding: 11 },
  statIconRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  statLabel: { fontSize: 7.6, color: MUTED, fontWeight: 500, marginLeft: 5 },
  statValue: { fontSize: 9.6, color: INK, fontWeight: 600, lineHeight: 1.3 },

  // -- Callout cards (opportunity / benefits / closing) --------------------
  calloutCard: { flexDirection: "row", backgroundColor: SURFACE, borderRadius: 10, padding: 16, marginBottom: 24 },
  calloutIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER, alignItems: "center", justifyContent: "center", marginRight: 14 },
  calloutBody: { flex: 1 },
  calloutTitle: { fontSize: 11, fontFamily: "Inter", fontWeight: 600, color: INK, marginBottom: 6 },
  calloutText: { fontSize: 10, color: SLATE, lineHeight: 1.6 },

  // -- Sections --------------------------------------------------------
  section: { marginBottom: 22 },
  sectionHeadRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sectionIconWrap: { width: 22, height: 22, borderRadius: 11, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", marginRight: 8 },
  sectionTitle: { fontSize: 11.5, fontFamily: "Inter", fontWeight: 600, color: INK },
  checkRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 7, paddingLeft: 2 },
  checkMarkWrap: { width: 16, paddingTop: 3 },
  checkText: { flex: 1, lineHeight: 1.55, color: SLATE, fontSize: 9.9 },

  reqRow: { flexDirection: "row", gap: 14 },
  reqCard: { flex: 1, backgroundColor: SURFACE, borderRadius: 10, padding: 14 },
  reqCardTitle: { fontSize: 9.5, fontFamily: "Inter", fontWeight: 600, color: INK, marginBottom: 8 },

  // -- Closing / footer -------------------------------------------------
  closingTagline: { fontSize: 10.5, fontFamily: "Playfair Display", fontStyle: "italic", color: ACCENT, marginTop: 8 },

  footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: BORDER, paddingVertical: 12, paddingHorizontal: 46, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  footerText: { fontSize: 8, color: MUTED, fontWeight: 500 },
});

// -- Minimal line icons, hand-drawn with react-pdf's own Svg primitives so
// the document has no dependency on an external icon font/library. Kept to
// plain circles/rects/lines wherever possible to stay crisp at small sizes.
type IconName =
  | "briefcase"
  | "pin"
  | "star"
  | "coin"
  | "home"
  | "target"
  | "trend"
  | "user"
  | "checklist"
  | "gift"
  | "check";

function Icon({ name, color = INK, size = 15 }: { name: IconName; color?: string; size?: number }) {
  const s = { stroke: color, strokeWidth: 1.6, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === "briefcase" && (
        <>
          <Rect x={3} y={7} width={18} height={12} rx={2} {...s} />
          <Path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" {...s} />
          <Line x1={3} y1={12.5} x2={21} y2={12.5} {...s} />
        </>
      )}
      {name === "pin" && (
        <>
          <Path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12z" {...s} />
          <Circle cx={12} cy={9} r={2.3} {...s} />
        </>
      )}
      {name === "star" && (
        <Polygon
          points="12,3 14.12,9.09 20.56,9.22 15.42,13.11 17.29,19.28 12,15.6 6.71,19.28 8.58,13.11 3.44,9.22 9.88,9.09"
          {...s}
        />
      )}
      {name === "coin" && (
        <>
          <Circle cx={12} cy={12} r={8.5} {...s} />
          <Line x1={12} y1={6.7} x2={12} y2={17.3} {...s} />
          <Line x1={8.2} y1={9.2} x2={15.8} y2={9.2} {...s} />
        </>
      )}
      {name === "home" && (
        <>
          <Path d="M4 11.5 12 4l8 7.5" {...s} />
          <Path d="M6 10v9h12v-9" {...s} />
          <Rect x={10} y={14} width={4} height={5} {...s} />
        </>
      )}
      {name === "target" && (
        <>
          <Circle cx={12} cy={12} r={8.3} {...s} />
          <Circle cx={12} cy={12} r={4.8} {...s} />
          <Circle cx={12} cy={12} r={1.4} fill={color} stroke="none" />
        </>
      )}
      {name === "trend" && (
        <>
          <Path d="M4 16.5 9.5 11l4 4L20 7.2" {...s} />
          <Path d="M14.5 7h5.5v5.5" {...s} />
        </>
      )}
      {name === "user" && (
        <>
          <Circle cx={12} cy={8.2} r={3.4} {...s} />
          <Path d="M5 20c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5" {...s} />
        </>
      )}
      {name === "checklist" && (
        <>
          <Rect x={5} y={3} width={14} height={18} rx={2} {...s} />
          <Line x1={8} y1={8} x2={16} y2={8} {...s} />
          <Line x1={8} y1={12} x2={16} y2={12} {...s} />
          <Line x1={8} y1={16} x2={13} y2={16} {...s} />
        </>
      )}
      {name === "check" && <Path d="M4 12.5 9.5 18 20 6" {...s} />}
      {name === "gift" && (
        <>
          <Rect x={4} y={9} width={16} height={11} rx={1} {...s} />
          <Rect x={3} y={6} width={18} height={4} rx={1} {...s} />
          <Line x1={12} y1={6} x2={12} y2={20} {...s} />
          <Path d="M12 6c-1-2.6-3.6-2.6-3.9-1.2C7.8 6 9.6 6 12 6z" {...s} />
          <Path d="M12 6c1-2.6 3.6-2.6 3.9-1.2C16.2 6 14.4 6 12 6z" {...s} />
        </>
      )}
    </Svg>
  );
}

function Check({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((item, i) => (
        <View key={i} style={styles.checkRow} wrap={false}>
          <View style={styles.checkMarkWrap}>
            <Icon name="check" color={ACCENT} size={10} />
          </View>
          <Text style={styles.checkText}>{item}</Text>
        </View>
      ))}
    </>
  );
}

function SectionHeading({ icon, children }: { icon: IconName; children: string }) {
  return (
    <View style={styles.sectionHeadRow}>
      <View style={styles.sectionIconWrap}>
        <Icon name={icon} color={ACCENT} size={12} />
      </View>
      <Text style={styles.sectionTitle}>{children}</Text>
    </View>
  );
}

function StatCard({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconRow}>
        <Icon name={icon} color={ACCENT} size={13} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function JdDocument({ mandate }: { mandate: JdPdfMandate }) {
  ensureFonts();
  const clientDisplay = clientDisplayName(mandate);
  const cities = mandate.cities?.length ? mandate.cities : mandate.city ? [mandate.city] : [];
  const subDomains = mandate.sub_domains?.length ? mandate.sub_domains : mandate.sub_domain ? [mandate.sub_domain] : [];
  const budget = budgetLabel(mandate.budget_min, mandate.budget_max);
  const experience = experienceLabel(mandate.experience_min, mandate.experience_max);
  const logoPath = path.join(process.cwd(), "public", "staffanchor-logo-pdf.png");
  const functionLabel = mandate.category ? CATEGORY_LABEL[mandate.category] ?? mandate.category : null;

  const stats: { icon: IconName; label: string; value: string }[] = [];
  if (functionLabel) stats.push({ icon: "briefcase", label: "Function", value: functionLabel });
  if (cities.length) stats.push({ icon: "pin", label: "Location", value: cities.join(", ") });
  if (experience) stats.push({ icon: "star", label: "Experience", value: experience });
  if (budget) stats.push({ icon: "coin", label: "Compensation", value: budget });
  if (mandate.work_mode) stats.push({ icon: "home", label: "Work Mode", value: mandate.work_mode });

  // Short tag-row summary under the title (e.g. "B2B Sales · Bengaluru,
  // Remote · Hybrid") instead of a full sentence -- the sentence-form
  // client attribution moves to its own quieter line below.
  const tags = [functionLabel, cities.join(", ") || null, mandate.work_mode].filter(Boolean) as string[];

  return (
    <Document title={`JD - ${mandate.role_title} - ${clientDisplay}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- this is react-pdf's own Image primitive (renders into the PDF), not an HTML <img>; it has no alt prop. */}
          <Image src={logoPath} style={styles.logo} />
          <Text style={styles.headerRight}>Confidential Search</Text>
        </View>
        <View style={styles.hairline} />

        <View style={styles.titleBlock}>
          <Text style={styles.eyebrow}>Confidential Role Brief</Text>
          <Text style={styles.roleTitle}>{mandate.role_title}</Text>
          {tags.length > 0 && (
            <View style={styles.tagRow}>
              {tags.map((t, i) => (
                <Text key={i}>
                  <Text style={styles.tag}>{t}</Text>
                  {i < tags.length - 1 && <Text style={styles.tagDot}>{"   ·   "}</Text>}
                </Text>
              ))}
            </View>
          )}
          <Text style={styles.attribution}>
            An exclusive search conducted by <Text style={styles.attributionStrong}>StaffAnchor</Text> on behalf of{" "}
            <Text style={styles.attributionStrong}>{clientDisplay}</Text>.
          </Text>
        </View>

        {stats.length > 0 && (
          <View style={styles.statRow} wrap={false}>
            {stats.map((s) => (
              <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} />
            ))}
          </View>
        )}

        {mandate.jd_overview && (
          <View style={styles.calloutCard} wrap={false}>
            <View style={styles.calloutIconWrap}>
              <Icon name="target" color={ACCENT} size={16} />
            </View>
            <View style={styles.calloutBody}>
              <Text style={styles.calloutTitle}>Why This Role Matters</Text>
              <Text style={styles.calloutText}>{mandate.jd_overview}</Text>
            </View>
          </View>
        )}

        {lines(mandate.jd_responsibilities).length > 0 && (
          <View style={styles.section}>
            <SectionHeading icon="trend">Responsibilities</SectionHeading>
            <Check items={lines(mandate.jd_responsibilities)} />
          </View>
        )}

        {lines(mandate.jd_candidate_profile).length > 0 && (
          <View style={styles.section}>
            <SectionHeading icon="user">Ideal Candidate</SectionHeading>
            <Check items={lines(mandate.jd_candidate_profile)} />
          </View>
        )}

        {(mandate.must_haves?.length || mandate.good_to_haves?.length) ? (
          <View style={styles.section} wrap={false}>
            <SectionHeading icon="checklist">Requirements</SectionHeading>
            <View style={styles.reqRow} wrap={false}>
              {mandate.must_haves?.length ? (
                <View style={styles.reqCard}>
                  <Text style={styles.reqCardTitle}>Must Have</Text>
                  <Check items={mandate.must_haves} />
                </View>
              ) : null}
              {mandate.good_to_haves?.length ? (
                <View style={styles.reqCard}>
                  <Text style={styles.reqCardTitle}>Good to Have</Text>
                  <Check items={mandate.good_to_haves} />
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {lines(mandate.jd_compensation_benefits).length > 0 && (
          <View style={styles.calloutCard} wrap={false}>
            <View style={styles.calloutIconWrap}>
              <Icon name="gift" color={ACCENT} size={16} />
            </View>
            <View style={styles.calloutBody}>
              <Text style={styles.calloutTitle}>Compensation &amp; Benefits</Text>
              <Check items={lines(mandate.jd_compensation_benefits)} />
            </View>
          </View>
        )}

        <View style={[styles.calloutCard, { marginBottom: 4 }]} wrap={false}>
          <View style={styles.calloutBody}>
            <Text style={styles.calloutText}>
              This role is being managed exclusively through <Text style={styles.attributionStrong}>StaffAnchor</Text>.
              For questions about this opportunity, please reply to the recruiter who shared this document with you.
            </Text>
            <Text style={styles.closingTagline}>Right Talent. Right Impact. Every Time.</Text>
          </View>
        </View>

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Confidential</Text>
          <Text style={styles.footerText}>Prepared by StaffAnchor · www.staffanchor.com</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderJdPdf(mandate: JdPdfMandate): Promise<Buffer> {
  return renderToBuffer(<JdDocument mandate={mandate} />);
}
