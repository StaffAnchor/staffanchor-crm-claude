// The Sales CV form (StaffAnchor Edge): what is asked, the shape the answers are saved in, how they are cleaned, which
// number prompts show for which kind of sales role, and what counts as a gap. Pure data and functions with no server
// imports, so the CRM (which saves and shows the answers) and the jobs site (which shows the form) use this one file.
// The jobs site keeps a copy at src/lib/cv-brief/config.ts: change both together.

export const CONSENT_VERSION = "2026-10-v1";

export const FUNCTIONS = ["Inside sales", "Field sales", "Business development", "Key / account management", "Enterprise sales", "Channel / partner sales", "Retail / distribution sales", "Sales operations / enablement", "Sales leadership", "Other"];
export const LEVELS = ["Executive / associate", "Senior executive", "Team lead", "Manager", "Senior manager", "Director / AVP", "VP / business head", "CXO / founder"];
export const LEADER_LEVELS = ["Team lead", "Manager", "Senior manager", "Director / AVP", "VP / business head", "CXO / founder"];
export const MODELS = ["B2B", "B2C", "B2B2C", "Marketplace", "D2C", "Distribution-led"];
export const MOTIONS = ["Inbound", "Outbound", "Phone / inside", "Field visits", "Consultative", "Transactional", "Enterprise", "Product-led", "Relationship-led"];
export const CUSTOMERS = ["Consumers", "Small business", "Mid-market", "Large enterprise", "Government", "Institutions", "Retailers", "Distributors"];
export const BUYERS = ["Founder / owner", "CXO", "Functional head", "Procurement", "HR", "IT", "Finance", "End consumer"];
export const CHANNELS = ["Phone", "Video / online", "Email", "Field visits", "Website / app", "Digital leads", "Partners", "Distributors", "Resellers", "Retail", "Marketplaces"];
export const ROUTES = ["Direct", "Through partners / distributors", "Both"];
export const CYCLES = ["Same day", "Under 1 week", "1 to 4 weeks", "1 to 3 months", "3 to 6 months", "6 to 12 months", "Over a year"];
export const INDUSTRIES = ["SaaS / software", "IT services", "Fintech / BFSI", "Edtech", "Consumer internet", "Telecom", "Healthcare / pharma", "FMCG / retail", "Manufacturing / industrial", "Real estate", "Automotive", "Logistics", "Recruitment / HR services", "Media / advertising", "Other"];
export const TOOLS = ["Salesforce", "HubSpot", "Zoho", "LeadSquared", "Freshsales", "Pipedrive", "Sales Navigator", "Apollo", "Dialer / telephony", "Excel / Sheets", "Power BI / Tableau"];
export const WIN_TYPES = ["Revenue growth", "Beat target", "New market / geography", "Built or scaled a team", "Improved productivity", "Improved conversion", "Won a key account", "Launched a product / channel", "Turnaround", "Better retention / lower attrition", "Process / automation", "Award / recognition", "Other"];
export const CURRENCIES = ["INR", "USD", "GBP", "EUR", "AED", "SGD", "Other"];
export const UNITS = ["", "Thousand", "Lakh", "Crore", "Million", "Billion"];
export const PERIODS = ["Per month", "Per quarter", "Per year", "Total over my time there"];
export const SCOPES: { value: Scope; label: string }[] = [
  { value: "own", label: "Mine personally" },
  { value: "team", label: "My team's" },
  { value: "business", label: "Whole business I was responsible for" },
];
export const EDUCATION = ["Class 12", "Diploma", "Graduate", "Post-graduate / MBA", "Doctorate", "Other"];
export const STATUSES = ["Working", "Serving notice", "Not working right now", "Freelancing / consulting"];
export const NOTICE = ["Immediate", "15 days", "30 days", "60 days", "90 days", "More than 90 days"];
export const RELOCATE = ["Yes, anywhere", "Within my region", "Specific cities only", "No"];
export const TRAVEL = ["None", "Occasional", "Up to 25%", "Up to 50%", "More than 50%"];
export const WORK_MODES = ["Office", "Hybrid", "Remote", "Any"];
export const EMP_TYPES = ["Full-time", "Contract", "Consulting", "Any"];
export const COMPANY_TYPES = ["Startup", "Scale-up", "Large / MNC", "Indian conglomerate", "Any"];
export const CV_PAGES = ["One page", "Two pages", "Whatever works best"];
export const LANGUAGES = ["English", "Hindi", "Marathi", "Gujarati", "Punjabi", "Tamil", "Telugu", "Kannada", "Malayalam", "Bengali", "Odia", "Assamese", "Urdu"];

export type Scope = "own" | "team" | "business";
export type MetricKind = "money" | "count" | "percent";

export type Metric = {
  id: string;
  key: string;
  label: string;
  kind: MetricKind;
  amount: number | null;
  currency: string;
  unit: string;
  period: string;
  scope: Scope;
  basis: "actual" | "estimate";
  note: string;
};

export type Win = { id: string; type: string; text: string; result: string };

export type Job = {
  id: string;
  fromCv: boolean;
  employer: string;
  industry: string;
  city: string;
  start: string; // YYYY-MM
  end: string; // YYYY-MM, empty when current
  current: boolean;
  title: string;
  fn: string;
  level: string;
  sells: string;
  model: string[];
  customers: string[];
  buyers: string[];
  motion: string[];
  channels: string[];
  route: string;
  cycle: string;
  reportsTo: string;
  geography: string;
  metrics: Metric[];
  manages: "" | "yes" | "no";
  team: { direct: number | null; total: number | null; layers: string; hired: string; attrition: string; note: string };
  tools: string[];
  process: string;
  wins: Win[];
  growth: { from: string; to: string; period: string };
  promoted: string;
  extra: string;
};

export type Basics = {
  name: string; email: string; phone: string; city: string; employer: string; title: string; expYears: number | null;
  education: string; educationDetail: string; linkedin: string; status: string;
};

export type Targets = {
  roles: string; levels: string[]; industries: string[]; companyTypes: string[]; cities: string; relocate: string; travel: string;
  workMode: string; empType: string; notice: string; currentFixed: number | null; currentVariable: number | null;
  expectedFixed: number | null; expectedVariable: number | null; avoid: string; note: string;
};

export type Extras = { certifications: string; languages: string[]; awards: string; cvPages: string; cvAvoid: string; confidential: boolean; gaps: string; anything: string };

export type CvData = { basics: Basics; jobs: Job[]; targets: Targets; extras: Extras };

const MAX_JOBS = 10;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyJob(): Job {
  return {
    id: newId(), fromCv: false, employer: "", industry: "", city: "", start: "", end: "", current: false, title: "", fn: "", level: "",
    sells: "", model: [], customers: [], buyers: [], motion: [], channels: [], route: "", cycle: "", reportsTo: "", geography: "", metrics: [],
    manages: "", team: { direct: null, total: null, layers: "", hired: "", attrition: "", note: "" }, tools: [], process: "", wins: [],
    growth: { from: "", to: "", period: "" }, promoted: "", extra: "",
  };
}

export function emptyData(): CvData {
  return {
    basics: { name: "", email: "", phone: "", city: "", employer: "", title: "", expYears: null, education: "", educationDetail: "", linkedin: "", status: "" },
    jobs: [],
    targets: { roles: "", levels: [], industries: [], companyTypes: [], cities: "", relocate: "", travel: "", workMode: "", empType: "", notice: "", currentFixed: null, currentVariable: null, expectedFixed: null, expectedVariable: null, avoid: "", note: "" },
    extras: { certifications: "", languages: [], awards: "", cvPages: "", cvAvoid: "", confidential: false, gaps: "", anything: "" },
  };
}

// ---- cleaning: whatever arrives is coerced to the shape above and capped, never trusted ----

const str = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const text = (v: unknown) => str(v, 3000);
const num = (v: unknown, max = 1e12): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};
// Fixed pay can never be 0, so a 0 there counts as not answered.
const pos = (v: unknown, max = 1000): number | null => {
  const n = num(v, max);
  return n !== null && n > 0 ? n : null;
};
const list = (v: unknown, max = 20, each = 80): string[] => (Array.isArray(v) ? v.map((x) => str(x, each)).filter(Boolean).slice(0, max) : []);
const oneOf = (v: unknown, allowed: string[]) => (typeof v === "string" && allowed.includes(v) ? v : "");
const month = (v: unknown) => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : "");
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const id = (v: unknown) => (typeof v === "string" && /^[\w-]{3,24}$/.test(v) ? v : newId());

export function cleanMetric(raw: unknown): Metric {
  const m = rec(raw);
  const kind = oneOf(m.kind, ["money", "count", "percent"]) as MetricKind | "";
  return {
    id: id(m.id),
    key: str(m.key, 40),
    label: str(m.label, 80),
    kind: kind || "money",
    amount: num(m.amount),
    currency: kind === "money" || !kind ? oneOf(m.currency, CURRENCIES) || "INR" : "",
    unit: kind === "money" || !kind ? oneOf(m.unit, UNITS) : "",
    period: oneOf(m.period, PERIODS),
    scope: (oneOf(m.scope, ["own", "team", "business"]) as Scope) || "own",
    basis: m.basis === "estimate" ? "estimate" : "actual",
    note: str(m.note, 300),
  };
}

export function cleanJob(raw: unknown): Job {
  const j = rec(raw);
  const t = rec(j.team);
  const g = rec(j.growth);
  const current = j.current === true;
  return {
    id: id(j.id),
    fromCv: j.fromCv === true,
    employer: str(j.employer, 120), industry: str(j.industry, 80), city: str(j.city, 80),
    start: month(j.start), end: current ? "" : month(j.end), current,
    title: str(j.title, 120), fn: str(j.fn, 80), level: str(j.level, 80),
    sells: text(j.sells), model: list(j.model, 6), customers: list(j.customers), buyers: list(j.buyers), motion: list(j.motion), channels: list(j.channels),
    route: oneOf(j.route, ROUTES), cycle: oneOf(j.cycle, CYCLES), reportsTo: str(j.reportsTo, 120), geography: str(j.geography, 200),
    metrics: (Array.isArray(j.metrics) ? j.metrics : []).slice(0, 16).map(cleanMetric),
    manages: j.manages === "yes" || j.manages === "no" ? j.manages : "",
    team: { direct: num(t.direct, 100000), total: num(t.total, 1000000), layers: str(t.layers, 40), hired: str(t.hired, 80), attrition: str(t.attrition, 80), note: str(t.note, 400) },
    tools: list(j.tools, 20), process: text(j.process),
    wins: (Array.isArray(j.wins) ? j.wins : []).slice(0, 4).map((w) => {
      const x = rec(w);
      return { id: id(x.id), type: str(x.type, 60), text: text(x.text), result: str(x.result, 400) };
    }),
    growth: { from: str(g.from, 120), to: str(g.to, 120), period: str(g.period, 80) },
    promoted: str(j.promoted, 400), extra: text(j.extra),
  };
}

export function sanitize(raw: unknown): CvData {
  const r = rec(raw);
  const b = rec(r.basics);
  const t = rec(r.targets);
  const e = rec(r.extras);
  const d = emptyData();
  return {
    basics: {
      name: str(b.name, 120), email: str(b.email, 160), phone: str(b.phone, 30), city: str(b.city, 80), employer: str(b.employer, 120), title: str(b.title, 120),
      expYears: num(b.expYears, 60), education: oneOf(b.education, EDUCATION), educationDetail: str(b.educationDetail, 300), linkedin: str(b.linkedin, 300), status: oneOf(b.status, STATUSES),
    },
    jobs: (Array.isArray(r.jobs) ? r.jobs : []).slice(0, MAX_JOBS).map(cleanJob),
    targets: {
      ...d.targets,
      roles: str(t.roles, 400), levels: list(t.levels, 8), industries: list(t.industries, 15), companyTypes: list(t.companyTypes, 6), cities: str(t.cities, 300),
      relocate: oneOf(t.relocate, RELOCATE), travel: oneOf(t.travel, TRAVEL), workMode: oneOf(t.workMode, WORK_MODES), empType: oneOf(t.empType, EMP_TYPES), notice: oneOf(t.notice, NOTICE),
      currentFixed: pos(t.currentFixed), currentVariable: num(t.currentVariable, 1000), expectedFixed: pos(t.expectedFixed), expectedVariable: num(t.expectedVariable, 1000),
      avoid: str(t.avoid, 400), note: text(t.note),
    },
    extras: {
      certifications: str(e.certifications, 600), languages: list(e.languages, 12), awards: text(e.awards), cvPages: oneOf(e.cvPages, CV_PAGES), cvAvoid: str(e.cvAvoid, 600),
      confidential: e.confidential === true, gaps: text(e.gaps), anything: text(e.anything),
    },
  };
}

// ---- which number prompts show: the form stays short because each person sees only what fits their kind of selling ----

export type Preset = { key: string; label: string; kind: MetricKind; scope: Scope; hint: string };

const P = (key: string, label: string, kind: MetricKind, scope: Scope, hint: string): Preset => ({ key, label, kind, scope, hint });

export const isLeader = (j: Job) => LEADER_LEVELS.includes(j.level) || j.manages === "yes";

export function presetsFor(j: Job): Preset[] {
  const out: Preset[] = [
    P("target", "Sales target", "money", "own", "Your own target for the period."),
    P("achieved", "Target achieved", "money", "own", "What you actually sold or booked."),
    P("attainment", "Target achieved, %", "percent", "own", "For example 112."),
  ];
  const motion = j.motion.join(" ").toLowerCase();
  const fn = j.fn.toLowerCase();
  const b2b = j.model.includes("B2B") || j.model.includes("B2B2C") || fn.includes("enterprise") || fn.includes("key");
  const b2c = j.model.includes("B2C") || j.model.includes("D2C") || fn.includes("inside");
  const saas = j.industry.startsWith("SaaS") || j.industry.startsWith("IT services");
  if (b2b) out.push(P("deal", "Typical deal size", "money", "own", "A usual deal, not the biggest."), P("deals", "Deals closed", "count", "own", "In the period."), P("pipeline", "Pipeline you handled", "money", "own", "Open opportunities value."));
  if (saas) out.push(P("arr", "ARR / annual contract value", "money", "own", "New annual recurring revenue you added."), P("renewal", "Renewal rate, %", "percent", "own", "If you owned renewals."));
  if (b2c) out.push(P("leads", "Leads handled", "count", "own", "Leads allotted to you in the period."), P("conversion", "Lead-to-sale conversion, %", "percent", "own", "Sales divided by leads."), P("order", "Average order value", "money", "own", "A usual order."));
  if (j.fn.startsWith("Channel") || j.channels.includes("Distributors") || j.channels.includes("Resellers") || (j.route !== "Direct" && j.route !== ""))
    out.push(P("partners", "Partners / distributors handled", "count", "own", "How many."), P("channelrev", "Revenue through channel", "money", "own", "Sales that came via partners."));
  if (j.fn.startsWith("Field") || motion.includes("field") || j.channels.includes("Field visits")) out.push(P("accounts", "Outlets / accounts covered", "count", "own", "How many."), P("visits", "Visits or meetings per day", "count", "own", "Average."));
  if (isLeader(j)) out.push(P("teamrev", "Team revenue", "money", "team", "What your whole team sold."), P("teamattain", "Team target achieved, %", "percent", "team", "Your team's attainment."), P("business", "Business / portfolio revenue", "money", "business", "Everything you were responsible for."), P("perrep", "Revenue per salesperson", "money", "team", "Average across the team."));
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.key) ? false : (seen.add(p.key), true)));
}

export function metricFromPreset(p: Preset): Metric {
  return { id: newId(), key: p.key, label: p.label, kind: p.kind, amount: null, currency: p.kind === "money" ? "INR" : "", unit: p.kind === "money" ? "Lakh" : "", period: p.kind === "money" ? "Per year" : "", scope: p.scope, basis: "actual", note: "" };
}

// ---- reading it back ----

export const SCOPE_TEXT: Record<Scope, string> = { own: "personal", team: "team", business: "whole business" };

export function formatMetric(m: Metric): string {
  if (m.amount === null) return "";
  const n = m.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const v = m.kind === "percent" ? `${n}%` : m.kind === "count" ? n : `${m.currency === "INR" ? "₹" : m.currency + " "}${n}${m.unit ? " " + m.unit : ""}`;
  return [v, m.period && m.kind === "money" ? m.period.toLowerCase() : "", SCOPE_TEXT[m.scope], m.basis === "estimate" ? "approximate" : ""].filter(Boolean).join(" · ");
}

export function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

export const jobPeriod = (j: Job) => [monthLabel(j.start), j.current ? "Present" : monthLabel(j.end)].filter(Boolean).join(" – ");

export const jobFilled = (j: Job) => !!(j.employer || j.title);

/** Suggestions, never errors: the details that make the biggest difference to a sales CV. Latest two jobs only. */
export function gaps(d: CvData): string[] {
  const out: string[] = [];
  if (!d.jobs.some(jobFilled)) out.push("Add at least your current or latest job.");
  d.jobs.filter(jobFilled).slice(0, 2).forEach((j, i) => {
    const who = j.employer || j.title || `Job ${i + 1}`;
    if (!j.sells.trim()) out.push(`${who}: what you sold.`);
    if (!j.metrics.some((m) => m.amount !== null)) out.push(`${who}: at least one number (target, achieved or revenue).`);
    if (isLeader(j) && j.team.total === null && j.team.direct === null) out.push(`${who}: how many people you managed.`);
    if (!j.wins.some((w) => w.text.trim())) out.push(`${who}: one achievement in your own words.`);
    if (!j.start) out.push(`${who}: when you started.`);
  });
  if (!d.targets.roles.trim()) out.push("The role you are looking for.");
  if (!d.basics.linkedin.trim()) out.push("Your LinkedIn link.");
  return out;
}

export function progress(d: CvData): number {
  const jobs = d.jobs.filter(jobFilled);
  const checks = [
    !!(d.basics.name && d.basics.email && d.basics.phone),
    jobs.length > 0,
    jobs.some((j) => j.metrics.some((m) => m.amount !== null)),
    jobs.some((j) => j.wins.some((w) => w.text.trim())),
    !!d.targets.roles.trim(),
    d.targets.cities.trim() !== "" || d.targets.relocate !== "",
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
