import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { MEASURES, change, resultOf } from "./calc";
import type { CohortData } from "./data";

// The cohort report for the sales head: a CSV (one row per manager) and a short PDF. Built from the same numbers the
// dashboards show, with default fonts (so "Rs", not the rupee sign).

const q = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function cohortCsv(d: CohortData): string {
  const head = ["Manager", "Email", "Designation", "Progress %", "Sessions attended", "Sessions held", "Assignments done", ...MEASURES.flatMap((m) => [`${m.label} baseline`, `${m.label} endline`, `${m.label} change`, `${m.label} result`]), "Measures improved (of 4)"];
  const rows = d.managers.map((m) => [
    m.member.full_name ?? "", m.member.email, m.member.profile.designation ?? "", m.progress, m.attended, d.sessionsHeld, m.assignmentsDone,
    ...MEASURES.flatMap((x) => { const p = m.values[x.key] ?? { baseline: null, endline: null }; return [p.baseline ?? "", p.endline ?? "", change(p) ?? "", resultOf(p, x.betterWhen) ?? ""]; }),
    m.endlineEntered === MEASURES.length ? m.improved : "",
  ]);
  const avgRow = ["Cohort average", "", "", d.kpis.avgProgress ?? "", "", d.sessionsHeld, "", ...d.rollup.per.flatMap((p) => [p.baselineAvg ?? "", p.endlineAvg ?? "", p.avgMovement ?? "", `${p.improved} of ${p.measured} improved`]), ""];
  const foot = ["Managers improving on 3 or more measures", d.rollup.improvingOn3Plus];
  return [head, ...rows, [], avgRow, [], foot].map((r) => r.map(q).join(",")).join("\n") + "\n";
}

const st = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: "Helvetica", color: "#0f172a" },
  brand: { fontSize: 8, color: "#0f766e", letterSpacing: 1.2, textTransform: "uppercase" },
  h1: { fontSize: 20, marginTop: 4, fontFamily: "Helvetica-Bold" },
  sub: { marginTop: 3, color: "#475569" },
  h2: { fontSize: 11, marginTop: 16, marginBottom: 6, fontFamily: "Helvetica-Bold" },
  kpis: { flexDirection: "row", gap: 8, marginTop: 14 },
  kpi: { flexGrow: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 6, padding: 8 },
  kpiLabel: { fontSize: 7, color: "#64748b", textTransform: "uppercase" },
  kpiVal: { fontSize: 15, marginTop: 2, fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0", paddingVertical: 4 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#94a3b8", paddingBottom: 3, fontFamily: "Helvetica-Bold", color: "#475569" },
  note: { marginTop: 14, fontSize: 8, color: "#64748b" },
});
const pctText = (v: number | null) => (v == null ? "-" : `${v}%`);

function Report({ d }: { d: CohortData }) {
  const k = d.kpis;
  const cols = [3, 1.1, 1.2, 1.2, 1.6];
  return (
    <Document title={`Sales Leaders Lab report - ${d.cohort.company_name}`}>
      <Page size="A4" style={st.page}>
        <Text style={st.brand}>Sales Leaders Lab by StaffAnchor</Text>
        <Text style={st.h1}>{d.cohort.company_name}</Text>
        <Text style={st.sub}>{d.cohort.name}{d.cohort.start_date ? `  |  started ${d.cohort.start_date}` : ""}  |  {d.sessionsHeld} of {d.sessions.length} sessions held</Text>
        <View style={st.kpis}>
          {[["Managers", String(k.managers)], ["Avg progress", pctText(k.avgProgress)], ["Attendance", pctText(k.attendancePct)], ["Baseline complete", pctText(k.baselinePct)], ["Improving on 3+", `${k.improvingOn3Plus} of ${k.managers}`]].map(([l, v]) => (
            <View key={l} style={st.kpi}><Text style={st.kpiLabel}>{l}</Text><Text style={st.kpiVal}>{v}</Text></View>
          ))}
        </View>
        <Text style={st.h2}>What moved: baseline to endline (cohort averages)</Text>
        <View style={st.head}><Text style={{ flex: 3 }}>Measure</Text><Text style={{ flex: 1.1 }}>Baseline</Text><Text style={{ flex: 1.1 }}>Endline</Text><Text style={{ flex: 1.1 }}>Movement</Text><Text style={{ flex: 1.4 }}>Improved</Text></View>
        {d.rollup.per.map((p) => (
          <View key={p.key} style={st.row}><Text style={{ flex: 3 }}>{p.label}</Text><Text style={{ flex: 1.1 }}>{p.baselineAvg ?? "-"}</Text><Text style={{ flex: 1.1 }}>{p.endlineAvg ?? "-"}</Text><Text style={{ flex: 1.1 }}>{p.avgMovement == null ? "-" : `${p.avgMovement > 0 ? "+" : ""}${p.avgMovement}`}</Text><Text style={{ flex: 1.4 }}>{p.measured ? `${p.improved} of ${p.measured}` : "-"}</Text></View>
        ))}
        <Text style={st.h2}>By manager</Text>
        <View style={st.head}>{["Manager", "Progress", "Attended", "Baseline", "Measures improved"].map((h, i) => <Text key={h} style={{ flex: cols[i] }}>{h}</Text>)}</View>
        {d.managers.map((m) => (
          <View key={m.member.id} style={st.row} wrap={false}>
            <Text style={{ flex: cols[0] }}>{m.member.full_name ?? m.member.email}</Text><Text style={{ flex: cols[1] }}>{m.progress}%</Text><Text style={{ flex: cols[2] }}>{d.sessionsHeld ? `${m.attended} of ${d.sessionsHeld}` : "-"}</Text><Text style={{ flex: cols[3] }}>{m.baselineEntered} of {MEASURES.length}</Text><Text style={{ flex: cols[4] }}>{m.endlineEntered === MEASURES.length ? `${m.improved} of ${MEASURES.length}` : "-"}</Text>
          </View>
        ))}
        <Text style={st.note}>We track movement in behaviour, not revenue, and promise no revenue outcome. Context to add: team size, tenure, and any change in territory or product. Prepared by StaffAnchor Talent Solutions.</Text>
      </Page>
    </Document>
  );
}

export const cohortPdf = (d: CohortData) => renderToBuffer(<Report d={d} />);
export const reportFileName = (d: CohortData, ext: string) => `Sales-Leaders-Lab-${d.cohort.company_name}`.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-").slice(0, 70) + `.${ext}`;
