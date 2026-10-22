import path from "path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { DIAGNOSIS_ROWS, RATINGS, SECTIONS, proofFields, reportSections, type Level, type SectionKey, type SessionData, type Track } from "./config";

// The PDF the candidate receives. Built from the same notes as the workspace, leaving out any part that is empty or switched
// off, and never including the private notes. Hind is used because it carries the rupee sign.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let registered = false;
function ensureFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "SessionHind",
    fonts: [
      { src: path.join(FONT_DIR, "Hind-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Hind-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Hind-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Hind-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
}

const INK = "#0F172A", MUTED = "#64748B", LINE = "#E2E8F0", BLUE = "#2563EB", NAVY = "#0A1630", GREEN = "#059669";
const st = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 62, paddingHorizontal: 44, fontFamily: "SessionHind", fontSize: 10.5, color: INK, lineHeight: 1.45 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logo: { width: 112, height: 66, objectFit: "contain" },
  tag: { fontSize: 8.5, fontWeight: 600, color: BLUE, letterSpacing: 1.4, textTransform: "uppercase" },
  h1: { fontSize: 24, fontWeight: 700, color: NAVY, marginTop: 14, lineHeight: 1.25 },
  sub: { fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.4 },
  short: { marginTop: 16, padding: 12, borderRadius: 6, backgroundColor: "#EFF6FF", borderLeftWidth: 3, borderLeftColor: BLUE },
  shortLabel: { fontSize: 8.5, fontWeight: 700, color: BLUE, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 3 },
  sec: { marginTop: 18 },
  secHead: { flexDirection: "row", alignItems: "center", marginBottom: 7, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: LINE },
  secNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: NAVY, color: "white", fontSize: 9, fontWeight: 700, textAlign: "center", paddingTop: 4, marginRight: 8 },
  secTitle: { fontSize: 13.5, fontWeight: 700, color: NAVY },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", paddingRight: 10, marginBottom: 6 },
  label: { fontSize: 8.5, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  val: { fontSize: 10.5, color: INK },
  p: { marginBottom: 5 },
  b: { fontWeight: 600 },
  row: { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: LINE },
  bullet: { flexDirection: "row", marginBottom: 2.5 },
  dot: { width: 10, color: BLUE },
  quote: { padding: 9, borderLeftWidth: 2, borderLeftColor: "#94A3B8", backgroundColor: "#F8FAFC", marginBottom: 8 },
  chip: { fontSize: 8.5, fontWeight: 700, paddingVertical: 2, paddingHorizontal: 7, borderRadius: 8 },
  box: { width: 11, height: 11, borderWidth: 1, borderColor: "#94A3B8", borderRadius: 2, marginRight: 8, marginTop: 2 },
  foot: { position: "absolute", left: 44, right: 44, bottom: 26, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: MUTED, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 6 },
});

const lines = (t: string) => t.split("\n").map((l) => l.replace(/^[\s•\-*]+/, "").trim()).filter(Boolean);
const has = (t: string | undefined) => (t ?? "").trim() !== "";
const RATING_STYLE = { strong: { bg: "#D1FAE5", fg: "#065F46" }, ok: { bg: "#FEF3C7", fg: "#92400E" }, needs_work: { bg: "#FEE2E2", fg: "#991B1B" } } as const;

const Bullets = ({ text }: { text: string }) => (
  <View>
    {lines(text).map((l, i) => (
      <View key={i} style={st.bullet} wrap={false}><Text style={st.dot}>•</Text><Text style={{ flex: 1 }}>{l}</Text></View>
    ))}
  </View>
);
const Field = ({ label, value }: { label: string; value: string }) => (has(value) ? <View style={st.cell}><Text style={st.label}>{label}</Text><Text style={st.val}>{value}</Text></View> : null);
const Para = ({ label, text }: { label?: string; text: string }) => (has(text) ? <View style={st.p}>{label ? <Text style={st.label}>{label}</Text> : null}<Text>{text}</Text></View> : null);

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <View style={st.sec}>
      <View style={st.secHead} wrap={false}><Text style={st.secNum}>{n}</Text><Text style={st.secTitle}>{title}</Text></View>
      {children}
    </View>
  );
}

function Document_({ name, track, level, d, when }: { name: string; track: Track; level: Level; d: SessionData; when: Date }) {
  ensureFonts();
  const keys = reportSections(d);
  const show = (k: SectionKey) => keys.includes(k);
  let n = 0;
  const num = () => ++n;
  const s = d.snapshot;
  const dateText = when.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const proof = proofFields(track, level).filter((f) => has(d.positioning.proof[f.key]));

  return (
    <Document title={`Job search strategy summary - ${name}`} author="StaffAnchor Talent Solutions">
      <Page size="A4" style={st.page}>
        <View style={st.foot} fixed>
          <Text>StaffAnchor Talent Solutions · info@staffanchor.com · 7273000088</Text>
        </View>
        <View style={st.top}>
          <Image src={path.join(process.cwd(), "public", "staffanchor-logo-pdf.png")} style={st.logo} />
          <Text style={st.tag}>Job Search Strategy Session</Text>
        </View>
        <Text style={st.h1}>Your job search plan</Text>
        <Text style={st.sub}>Prepared for {name} · {dateText} · by Gagan Sharma, Founder, StaffAnchor</Text>

        {has(d.actions.inShort) && show("actions") && (
          <View style={st.short}><Text style={st.shortLabel}>In short</Text><Text>{d.actions.inShort}</Text></View>
        )}

        {show("snapshot") && (
          <Section n={num()} title="Where you are and where you want to go">
            <View style={st.grid}>
              <Field label="Current role" value={[s.currentRole, s.currentCompany].filter(has).join(" at ")} />
              <Field label="Experience" value={s.experienceYears} />
              <Field label="Current CTC" value={s.currentCtc} />
              <Field label="Expected CTC" value={s.expectedCtc} />
              <Field label="Notice period" value={s.noticePeriod} />
              <Field label="Location" value={s.location} />
              <Field label="Target roles" value={s.targetRoles} />
              <Field label="Target industries" value={s.targetIndustries} />
            </View>
            <Para label="Your goal" text={d.goal.goal} />
            <Para label="Timeline" text={d.goal.timeline} />
            <Para label="What you have tried so far" text={d.goal.tried} />
          </Section>
        )}

        {show("diagnosis") && (
          <Section n={num()} title="What is holding the search back">
            {DIAGNOSIS_ROWS.map((r) => {
              const row = d.diagnosis[r.key];
              if (!row.rating && !has(row.note)) return null;
              const rt = row.rating ? RATINGS.find((x) => x.key === row.rating)?.label : null;
              return (
                <View key={r.key} style={st.row} wrap={false}>
                  <View style={{ width: 92 }}><Text style={st.b}>{r.label}</Text>{rt && row.rating ? <Text style={[st.chip, { backgroundColor: RATING_STYLE[row.rating].bg, color: RATING_STYLE[row.rating].fg, marginTop: 3, alignSelf: "flex-start" }]}>{rt}</Text> : null}</View>
                  <Text style={{ flex: 1 }}>{row.note}</Text>
                </View>
              );
            })}
            {has(d.diagnosis.summary) && <Text style={{ marginTop: 8 }}>{d.diagnosis.summary}</Text>}
          </Section>
        )}

        {show("market") && (
          <Section n={num()} title="Where your next role will come from">
            {d.market.targets.some((t) => has(t.company) || has(t.why) || has(t.route)) && (
              <View>
                <View style={[st.row, { borderBottomColor: "#94A3B8" }]} wrap={false}>
                  <Text style={[st.label, { width: 130 }]}>Company or segment</Text><Text style={[st.label, { flex: 1 }]}>Why it fits</Text><Text style={[st.label, { flex: 1 }]}>Best route in</Text>
                </View>
                {d.market.targets.filter((t) => has(t.company) || has(t.why) || has(t.route)).map((t, i) => (
                  <View key={i} style={st.row} wrap={false}><Text style={[st.b, { width: 130 }]}>{t.company}</Text><Text style={{ flex: 1, paddingRight: 8 }}>{t.why}</Text><Text style={{ flex: 1 }}>{t.route}</Text></View>
                ))}
              </View>
            )}
            <View style={{ marginTop: 8 }}>
              <Para label="Recruiters and search firms to approach" text={d.market.recruiters} />
              <Para label="People to ask for introductions" text={d.market.referrals} />
            </View>
          </Section>
        )}

        {show("positioning") && (
          <Section n={num()} title="How to present yourself">
            <Para label="Your story in one line" text={d.positioning.story} />
            {proof.length > 0 && (
              <View style={{ marginTop: 2, marginBottom: 6 }}>
                <Text style={st.label}>Numbers that prove it</Text>
                {proof.map((f) => (
                  <View key={f.key} style={st.bullet} wrap={false}><Text style={st.dot}>•</Text><Text style={{ flex: 1 }}><Text style={st.b}>{f.label}: </Text>{d.positioning.proof[f.key]}</Text></View>
                ))}
              </View>
            )}
            {(has(d.positioning.headlineBefore) || has(d.positioning.headlineAfter)) && (
              <View style={{ marginBottom: 6 }}>
                <Text style={st.label}>LinkedIn headline</Text>
                {has(d.positioning.headlineBefore) && <Text style={{ color: MUTED }}>Now: {d.positioning.headlineBefore}</Text>}
                {has(d.positioning.headlineAfter) && <Text style={[st.b, { color: GREEN }]}>Suggested: {d.positioning.headlineAfter}</Text>}
              </View>
            )}
            {has(d.positioning.aboutAfter) && (<View><Text style={st.label}>Suggested About section</Text><View style={st.quote}><Text>{d.positioning.aboutAfter}</Text></View></View>)}
          </Section>
        )}

        {show("outreach") && (
          <Section n={num()} title="What to say, and how often">
            {[["To a hiring manager", d.outreach.toManager], ["To a recruiter", d.outreach.toRecruiter], ["Follow-up", d.outreach.followUp]].filter(([, t]) => has(t)).map(([l, t]) => (
              <View key={l} wrap={false}><Text style={st.label}>{l}</Text><View style={st.quote}><Text>{t}</Text></View></View>
            ))}
            {has(d.outreach.weeklyApproaches) && <Para label="Your weekly target" text={`${d.outreach.weeklyApproaches} approaches a week`} />}
            <Para label="Your weekly routine" text={d.outreach.routine} />
          </Section>
        )}

        {show("resume") && (
          <Section n={num()} title="Resume points">
            {([["Keep", d.resume.keep], ["Fix", d.resume.fix], ["Add", d.resume.add]] as const).filter(([, t]) => has(t)).map(([l, t]) => (
              <View key={l} style={{ marginBottom: 5 }}><Text style={st.label}>{l}</Text><Bullets text={t} /></View>
            ))}
          </Section>
        )}

        {show("actions") && d.actions.items.some((a) => has(a.action)) && (
          <Section n={num()} title="Your actions">
            {d.actions.items.filter((a) => has(a.action)).map((a, i) => (
              <View key={i} style={{ flexDirection: "row", marginBottom: 5 }} wrap={false}>
                <View style={st.box} /><Text style={{ flex: 1 }}>{a.action}</Text>{has(a.due) && <Text style={{ color: MUTED, marginLeft: 8 }}>by {a.due}</Text>}
              </View>
            ))}
          </Section>
        )}

        <Text style={{ marginTop: 20, fontSize: 8.5, color: MUTED }}>These are recommendations from our conversation, based on what you shared. They are not a guarantee of any outcome.</Text>
      </Page>
    </Document>
  );
}

export async function renderSessionReport(input: { name: string; track: Track; level: Level; data: SessionData; when?: Date }): Promise<Buffer> {
  return renderToBuffer(<Document_ name={input.name} track={input.track} level={input.level} d={input.data} when={input.when ?? new Date()} />);
}
export const reportFileName = (name: string) => `Job-search-plan-${name}`.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 70) + ".pdf";
export { SECTIONS };
