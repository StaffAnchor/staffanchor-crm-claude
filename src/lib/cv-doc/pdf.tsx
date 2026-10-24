import path from "path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { CvDoc } from "./types";

// The CV as a PDF: one clean single-column template that reads well on screen and in applicant tracking systems. Hind is used
// because it carries the rupee sign. The look can be swapped later without touching what the CV says.
const FONT_DIR = path.join(process.cwd(), "public", "fonts");
let registered = false;
function ensureFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "CvHind",
    fonts: [
      { src: path.join(FONT_DIR, "Hind-Regular.ttf"), fontWeight: 400 },
      { src: path.join(FONT_DIR, "Hind-Medium.ttf"), fontWeight: 500 },
      { src: path.join(FONT_DIR, "Hind-SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONT_DIR, "Hind-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]);
}

const INK = "#111827", MUTED = "#5B6472", LINE = "#D7DCE3", NAVY = "#0F2547", ACCENT = "#1D4ED8";
const st = StyleSheet.create({
  page: { paddingTop: 38, paddingBottom: 38, paddingHorizontal: 40, fontFamily: "CvHind", fontSize: 10, color: INK, lineHeight: 1.42 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  name: { fontSize: 25, fontWeight: 700, color: NAVY, lineHeight: 1.2 },
  headline: { fontSize: 11.5, fontWeight: 500, color: ACCENT, marginTop: 3 },
  contact: { fontSize: 9.2, color: MUTED, marginTop: 5 },
  photo: { width: 72, height: 72, borderRadius: 8, objectFit: "cover", marginLeft: 16 },
  sec: { marginTop: 14 },
  secHead: { fontSize: 9.5, fontWeight: 700, color: NAVY, letterSpacing: 1.4, textTransform: "uppercase", paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: LINE, marginBottom: 6 },
  p: { marginBottom: 3 },
  glance: { backgroundColor: "#F3F6FB", borderRadius: 5, paddingVertical: 7, paddingHorizontal: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  company: { fontSize: 11.5, fontWeight: 700, color: NAVY },
  muted: { color: MUTED, fontSize: 9.2 },
  role: { fontWeight: 600 },
  scope: { color: MUTED, marginTop: 2, marginBottom: 2 },
  bullet: { flexDirection: "row", marginBottom: 2 },
  dot: { width: 11, color: ACCENT },
  exp: { marginBottom: 9 },
  skillLine: { marginBottom: 2 },
  bold: { fontWeight: 600 },
});

const Bullets = ({ items }: { items: string[] }) => (
  <>
    {items.map((b, i) => (
      <View key={i} style={st.bullet} wrap={false}>
        <Text style={st.dot}>•</Text>
        <Text style={{ flex: 1 }}>{b}</Text>
      </View>
    ))}
  </>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <View style={st.sec}>
    <Text style={st.secHead} minPresenceAhead={40}>{title}</Text>
    {children}
  </View>
);

export type Photo = { data: Buffer; format: "png" | "jpg" } | null;

function CvPdf({ doc, photo }: { doc: CvDoc; photo: Photo }) {
  const h = doc.header;
  const contact = [h.email, h.phone, h.city, h.linkedin].filter(Boolean).join("   |   ");
  return (
    <Document title={`${h.name || "CV"}`} author={h.name || undefined}>
      <Page size="A4" style={st.page}>
        <View style={st.top}>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{h.name}</Text>
            {h.headline ? <Text style={st.headline}>{h.headline}</Text> : null}
            {contact ? <Text style={st.contact}>{contact}</Text> : null}
          </View>
          {h.showPhoto && photo ? <Image src={{ data: photo.data, format: photo.format }} style={st.photo} /> : null}
        </View>

        {doc.summary.trim() ? (
          <Section title="Summary">
            <Text>{doc.summary}</Text>
          </Section>
        ) : null}

        {doc.highlights.length ? (
          <Section title="Career at a glance">
            <View style={st.glance}><Bullets items={doc.highlights} /></View>
          </Section>
        ) : null}

        {doc.experience.length ? (
          <Section title="Experience">
            {doc.experience.map((e) => (
              <View key={e.id} style={st.exp}>
                <View wrap={false}>
                  <View style={st.row}>
                    <Text style={st.company}>{e.company}</Text>
                    <Text style={st.muted}>{[e.location, e.roles.length > 1 ? e.period : ""].filter(Boolean).join("  ·  ")}</Text>
                  </View>
                  {e.roles.map((r, i) => (
                    <View key={i} style={st.row}>
                      <Text style={st.role}>{r.title}</Text>
                      <Text style={st.muted}>{e.roles.length > 1 || !e.period ? r.period : e.period}</Text>
                    </View>
                  ))}
                  {e.scope ? <Text style={st.scope}>{e.scope}</Text> : null}
                </View>
                <Bullets items={e.bullets} />
                {e.tools ? <Text style={[st.muted, { marginTop: 2 }]}>Tools: {e.tools}</Text> : null}
              </View>
            ))}
          </Section>
        ) : null}

        {doc.education.length ? (
          <Section title="Education">
            {doc.education.map((e, i) => (
              <View key={i} style={st.row} wrap={false}>
                <Text><Text style={st.bold}>{e.degree}</Text>{e.institution ? `, ${e.institution}` : ""}</Text>
                <Text style={st.muted}>{e.year}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        {doc.skills.length ? (
          <Section title="Skills">
            {doc.skills.map((g) => (
              <Text key={g.label} style={st.skillLine}><Text style={st.bold}>{g.label}: </Text>{g.items.join("  ·  ")}</Text>
            ))}
          </Section>
        ) : null}

        {doc.certifications.length ? (
          <Section title="Certifications">
            <Bullets items={doc.certifications} />
          </Section>
        ) : null}

        {doc.awards.length ? (
          <Section title="Awards and recognition">
            <Bullets items={doc.awards} />
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}

export async function renderCvPdf(doc: CvDoc, photo: Photo): Promise<Buffer> {
  ensureFonts();
  return renderToBuffer(<CvPdf doc={doc} photo={photo} />);
}

export const cvFileName = (name: string, ext: "pdf" | "docx") => `CV ${(name || "Candidate").replace(/[^\w\s.-]+/g, "").trim() || "Candidate"}.${ext}`;
