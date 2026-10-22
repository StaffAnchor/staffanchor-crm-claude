// Job search strategy session report: what is captured in the meeting, the prompts for each kind of role, and the clean-up
// that makes whatever the browser sends safe to store and print.

export type Track = "sales" | "non_sales";
export type Level = "individual" | "manager" | "leader";
export type Rating = "strong" | "ok" | "needs_work" | null;

export const TRACKS: { key: Track; label: string }[] = [{ key: "sales", label: "Sales role" }, { key: "non_sales", label: "Non-sales role" }];
export const LEVELS: { key: Level; label: string }[] = [
  { key: "individual", label: "Individual contributor" },
  { key: "manager", label: "Manager" },
  { key: "leader", label: "Leader (head or above)" },
];

// In the order the meeting runs, with the time each part is meant to take in a 45-minute session.
export type SectionKey = "snapshot" | "diagnosis" | "market" | "positioning" | "outreach" | "resume" | "actions";
export const SECTIONS: { key: SectionKey; label: string; minutes: string; hint: string; inReport: boolean }[] = [
  { key: "snapshot", label: "Snapshot and goal", minutes: "0–5", hint: "Who they are, what they want, what they have tried.", inReport: true },
  { key: "diagnosis", label: "Diagnosis", minutes: "5–15", hint: "Why they are not getting the calls: targeting, positioning or channel.", inReport: true },
  { key: "market", label: "Market map", minutes: "15–25", hint: "Which companies and which route in.", inReport: true },
  { key: "positioning", label: "Positioning", minutes: "25–35", hint: "Their story, the numbers that prove it, and LinkedIn.", inReport: true },
  { key: "outreach", label: "Outreach", minutes: "35–42", hint: "What to say, and a weekly routine.", inReport: true },
  { key: "resume", label: "Resume points", minutes: "any time", hint: "What to keep, fix and add, for the resume.", inReport: true },
  { key: "actions", label: "Actions and summary", minutes: "42–45", hint: "The three things to do this week.", inReport: true },
];

export const DIAGNOSIS_ROWS: { key: "targeting" | "positioning" | "channel"; label: string; ask: string }[] = [
  { key: "targeting", label: "Targeting", ask: "Is the target role and level clear and realistic? Too broad, or too senior?" },
  { key: "positioning", label: "Positioning", ask: "Do the resume and LinkedIn show numbers, scale and ownership, or only duties?" },
  { key: "channel", label: "Channel", ask: "Where are applications going: portals, recruiters, referrals, direct approaches?" },
];
export const RATINGS: { key: Exclude<Rating, null>; label: string }[] = [
  { key: "strong", label: "Strong" }, { key: "ok", label: "Okay" }, { key: "needs_work", label: "Needs work" },
];

export type ProofField = { key: string; label: string; ph: string };
const SALES_PROOF: ProofField[] = [
  { key: "quota", label: "Quota attainment by year", ph: "For example 118%, 104%, 92%" },
  { key: "dealSize", label: "Typical deal size or ACV", ph: "For example Rs 8–15 lakh" },
  { key: "cycle", label: "Sales cycle", ph: "For example 3–4 months" },
  { key: "segment", label: "Segment and territory", ph: "SMB, mid-market or enterprise; which region" },
  { key: "mix", label: "New business vs existing accounts", ph: "For example 70% new, 30% expansion" },
  { key: "wins", label: "Biggest wins", ph: "Who, how big, how it was won" },
];
const SALES_LEAD_PROOF: ProofField[] = [
  { key: "team", label: "Team size and who reported to them", ph: "For example 12 reps and 2 team leads" },
  { key: "revenue", label: "Revenue or P&L owned, and growth", ph: "For example Rs 40 Cr, up 35% in 2 years" },
  { key: "attrition", label: "Hiring, ramp-up and attrition", ph: "Numbers, and what changed under them" },
  { key: "forecast", label: "Forecast accuracy and how targets were set", ph: "How close, how often" },
];
const NON_SALES_PROOF: ProofField[] = [
  { key: "scope", label: "Scope of the role", ph: "Function, budget, systems and stakeholders" },
  { key: "outcomes", label: "Three measurable outcomes", ph: "Before and after, with numbers" },
  { key: "projects", label: "Projects or initiatives led", ph: "What, how big, what changed" },
  { key: "tools", label: "Tools, systems and skills", ph: "What they use and are strongest at" },
  { key: "recognition", label: "Recognition, promotions or awards", ph: "What and when" },
];
const NON_SALES_LEAD_PROOF: ProofField[] = [
  { key: "team", label: "Team size and who reported to them", ph: "Headcount and levels" },
  { key: "budget", label: "Budget or cost owned", ph: "What, and what it delivered" },
  { key: "people", label: "Hiring, retention and performance outcomes", ph: "Numbers, and what changed under them" },
];
export function proofFields(track: Track, level: Level): ProofField[] {
  const lead = level !== "individual";
  return track === "sales" ? [...SALES_PROOF, ...(lead ? SALES_LEAD_PROOF : [])] : [...NON_SALES_PROOF, ...(lead ? NON_SALES_LEAD_PROOF : [])];
}

export type Target = { company: string; why: string; route: string };
export type ActionItem = { action: string; due: string };

export type SessionData = {
  snapshot: { currentRole: string; currentCompany: string; experienceYears: string; currentCtc: string; expectedCtc: string; noticePeriod: string; location: string; targetRoles: string; targetIndustries: string };
  goal: { goal: string; timeline: string; tried: string };
  diagnosis: Record<"targeting" | "positioning" | "channel", { rating: Rating; note: string }> & { summary: string };
  market: { targets: Target[]; recruiters: string; referrals: string };
  positioning: { story: string; proof: Record<string, string>; headlineBefore: string; headlineAfter: string; aboutAfter: string };
  outreach: { toManager: string; toRecruiter: string; followUp: string; weeklyApproaches: string; routine: string };
  resume: { keep: string; fix: string; add: string };
  actions: { items: ActionItem[]; inShort: string };
  privateNotes: string;
  include: Record<SectionKey, boolean>;
};

export function emptyData(): SessionData {
  return {
    snapshot: { currentRole: "", currentCompany: "", experienceYears: "", currentCtc: "", expectedCtc: "", noticePeriod: "", location: "", targetRoles: "", targetIndustries: "" },
    goal: { goal: "", timeline: "", tried: "" },
    diagnosis: { targeting: { rating: null, note: "" }, positioning: { rating: null, note: "" }, channel: { rating: null, note: "" }, summary: "" },
    market: { targets: [{ company: "", why: "", route: "" }], recruiters: "", referrals: "" },
    positioning: { story: "", proof: {}, headlineBefore: "", headlineAfter: "", aboutAfter: "" },
    outreach: { toManager: "", toRecruiter: "", followUp: "", weeklyApproaches: "", routine: "" },
    resume: { keep: "", fix: "", add: "" },
    actions: { items: [{ action: "", due: "" }, { action: "", due: "" }, { action: "", due: "" }], inShort: "" },
    privateNotes: "",
    include: { snapshot: true, diagnosis: true, market: true, positioning: true, outreach: true, resume: true, actions: true },
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);
const rating = (v: unknown): Rating => (v === "strong" || v === "ok" || v === "needs_work" ? v : null);

/** Whatever the browser sends is coerced into the exact shape above, with sizes capped, before it is stored or printed. */
export function sanitize(raw: unknown): SessionData {
  const r = obj(raw), d = emptyData();
  const sn = obj(r.snapshot), g = obj(r.goal), dg = obj(r.diagnosis), mk = obj(r.market), ps = obj(r.positioning), ou = obj(r.outreach), rs = obj(r.resume), ac = obj(r.actions), inc = obj(r.include);
  for (const k of Object.keys(d.snapshot) as (keyof SessionData["snapshot"])[]) d.snapshot[k] = str(sn[k], 300);
  d.goal = { goal: str(g.goal, 1500), timeline: str(g.timeline, 200), tried: str(g.tried, 1500) };
  for (const k of ["targeting", "positioning", "channel"] as const) {
    const row = obj(dg[k]);
    d.diagnosis[k] = { rating: rating(row.rating), note: str(row.note, 1500) };
  }
  d.diagnosis.summary = str(dg.summary, 1500);
  const targets = arr(mk.targets, 15).map((t) => { const o = obj(t); return { company: str(o.company, 200), why: str(o.why, 500), route: str(o.route, 500) }; });
  d.market = { targets: targets.length ? targets : d.market.targets, recruiters: str(mk.recruiters, 1500), referrals: str(mk.referrals, 1500) };
  const proof: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj(ps.proof)).slice(0, 30)) proof[k.slice(0, 40)] = str(v, 600);
  d.positioning = { story: str(ps.story, 1500), proof, headlineBefore: str(ps.headlineBefore, 300), headlineAfter: str(ps.headlineAfter, 300), aboutAfter: str(ps.aboutAfter, 3000) };
  d.outreach = { toManager: str(ou.toManager, 2000), toRecruiter: str(ou.toRecruiter, 2000), followUp: str(ou.followUp, 2000), weeklyApproaches: str(ou.weeklyApproaches, 100), routine: str(ou.routine, 1500) };
  d.resume = { keep: str(rs.keep, 1500), fix: str(rs.fix, 1500), add: str(rs.add, 1500) };
  const items = arr(ac.items, 8).map((t) => { const o = obj(t); return { action: str(o.action, 500), due: str(o.due, 60) }; });
  d.actions = { items: items.length ? items : d.actions.items, inShort: str(ac.inShort, 1500) };
  d.privateNotes = str(r.privateNotes, 8000);
  for (const s of SECTIONS) d.include[s.key] = inc[s.key] === false ? false : true;
  return d;
}

const has = (...v: (string | undefined)[]) => v.some((x) => (x ?? "").trim() !== "");

/** Which parts have something in them: used for the ticks in the workspace and to leave empty parts out of the report. */
export function filled(d: SessionData): Record<SectionKey, boolean> {
  return {
    snapshot: has(...Object.values(d.snapshot), ...Object.values(d.goal)),
    diagnosis: has(d.diagnosis.summary, d.diagnosis.targeting.note, d.diagnosis.positioning.note, d.diagnosis.channel.note) || [d.diagnosis.targeting, d.diagnosis.positioning, d.diagnosis.channel].some((x) => x.rating),
    market: d.market.targets.some((t) => has(t.company, t.why, t.route)) || has(d.market.recruiters, d.market.referrals),
    positioning: has(d.positioning.story, d.positioning.headlineAfter, d.positioning.aboutAfter) || Object.values(d.positioning.proof).some((v) => has(v)),
    outreach: has(...Object.values(d.outreach)),
    resume: has(...Object.values(d.resume)),
    actions: d.actions.items.some((a) => has(a.action)) || has(d.actions.inShort),
  };
}

/** What goes into the PDF: the parts that have content and have not been switched off. Private notes are never included. */
export function reportSections(d: SessionData): SectionKey[] {
  const f = filled(d);
  return SECTIONS.map((s) => s.key).filter((k) => d.include[k] && f[k]);
}

/** Starting values from the booking and, for the combo, the details form the candidate filled in. */
export function prefill(b: { experience_years?: number | null; target_role?: string | null }, intake: Record<string, string> | null): SessionData {
  const d = emptyData();
  if (b.experience_years != null) d.snapshot.experienceYears = String(b.experience_years);
  if (b.target_role) d.snapshot.targetRoles = b.target_role;
  if (intake) {
    d.snapshot.currentRole = str(intake.currentRole, 300) || d.snapshot.currentRole;
    d.snapshot.currentCompany = str(intake.currentCompany, 300);
    d.snapshot.experienceYears = str(intake.experience, 300) || d.snapshot.experienceYears;
    d.snapshot.targetRoles = str(intake.targetRole, 300) || d.snapshot.targetRoles;
    d.snapshot.targetIndustries = str(intake.targetIndustry, 300);
  }
  return d;
}
