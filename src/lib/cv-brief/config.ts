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

// How they sold: the processes they ran (inbound, outbound, existing customers, partners), asked as tiles with a little detail.
export const PROCESS_GROUPS: { group: string; items: { key: string; label: string }[] }[] = [
  { group: "Inbound", items: [{ key: "web", label: "Website and contact-us leads" }, { key: "chat", label: "Chat and WhatsApp enquiries" }, { key: "inbound_calls", label: "Inbound calls" }, { key: "campaign", label: "Marketing campaign leads" }, { key: "events", label: "Events and walk-ins" }] },
  { group: "Outbound", items: [{ key: "cold_calls", label: "Cold calling" }, { key: "cold_email", label: "Cold email" }, { key: "social", label: "LinkedIn and social outreach" }, { key: "field", label: "Field visits and door-to-door" }] },
  { group: "Existing customers", items: [{ key: "upsell", label: "Upsell and cross-sell" }, { key: "renewals", label: "Renewals" }, { key: "collections", label: "Collections and follow-up" }] },
  { group: "Partners and others", items: [{ key: "partners", label: "Partners and channel" }, { key: "referrals", label: "Referrals" }, { key: "tenders", label: "Tenders and RFPs" }] },
];
export const PROCESS_LABEL: Record<string, string> = Object.fromEntries(PROCESS_GROUPS.flatMap((g) => g.items.map((i) => [i.key, i.label])));
export const VOLUMES = ["Under 50", "50 to 200", "200 to 1,000", "1,000+", "Not sure"];
export const PROC_ROLES = ["I did it myself", "My team did it", "I set it up"];
export const STAGES = ["Finding leads", "Qualifying", "Demo or pitch", "Proposal and negotiation", "Closing", "Handover and onboarding", "Renewal and growth"];
export const LEAD_DUTIES = ["Hiring", "Training and onboarding", "Coaching", "Setting targets", "Performance reviews", "Incentive design", "Forecasting", "Pipeline reviews"];
export const COMPOSITION = ["Sales reps", "SDRs or BDRs", "Account managers", "Team leads or managers", "Pre-sales or support", "Field executives"];
export const RANGES_INR = ["Under ₹10 L", "₹10 to 50 L", "₹50 L to 1 Cr", "₹1 to 5 Cr", "₹5 to 10 Cr", "₹10 to 25 Cr", "₹25 to 50 Cr", "₹50 to 100 Cr", "Over ₹100 Cr"];

// Achievements as fill-in-the-blank sentences, so nobody has to write from scratch.
export const WIN_TEMPLATES: { id: string; type: string; tpl: string; ph: string[] }[] = [
  { id: "beat", type: "Beat target", tpl: "Exceeded target by {}% in {}", ph: ["For example 18", "For example FY24"] },
  { id: "grew", type: "Revenue growth", tpl: "Grew revenue from {} to {} in {}", ph: ["For example ₹2 Cr", "For example ₹5 Cr", "For example 18 months"] },
  { id: "team", type: "Built or scaled a team", tpl: "Built a team of {} {}", ph: ["For example 12", "For example from scratch in 6 months"] },
  { id: "market", type: "New market / geography", tpl: "Opened {} and reached {} in {}", ph: ["For example the West region", "For example ₹3 Cr", "For example a year"] },
  { id: "attr", type: "Better retention / lower attrition", tpl: "Brought team attrition down from {} to {}", ph: ["For example 40%", "For example 22%"] },
  { id: "conv", type: "Improved conversion", tpl: "Lifted lead-to-sale conversion from {} to {}", ph: ["For example 6%", "For example 11%"] },
  { id: "acct", type: "Won a key account", tpl: "Won {} worth {}", ph: ["The account or type of customer", "For example ₹1.2 Cr a year"] },
  { id: "award", type: "Award / recognition", tpl: "Received {} for {}", ph: ["For example the Top Performer award", "For example FY23 sales"] },
  { id: "custom", type: "Other", tpl: "{}", ph: ["Describe it in your own words"] },
];

export const assembleWin = (tpl: string, blanks: string[]) => {
  let i = 0;
  return tpl.replace(/\{\}/g, () => (blanks[i++] ?? "").trim() || "___");
};
export const winDone = (w: Win) => w.text.trim().length > 0 && !w.text.includes("___");

// The self-reflection step: how they sell and what they want next, in their own words, picked rather than typed.
export const STRENGTHS = ["Hunter", "Closer", "Farmer", "Relationship builder", "Consultative", "Negotiator", "Storyteller", "Data-driven", "Process-driven", "Resilient", "Persistent", "Fast learner", "Customer-first", "Strategic", "Coach", "Team builder"];
export const STYLES = ["Hunter: new business", "Farmer: growing accounts", "A mix of both", "Consultative adviser", "Technical or solution seller"];
export const WANT_NEXT = ["A bigger target", "A team to lead", "Faster growth", "A better product", "Stability", "Higher pay", "A new industry", "Global exposure", "Learning and mentoring", "Better work-life balance"];
export const PHOTO_PREFS = ["Yes, include it", "No photo on my CV", "Not sure, advise me"];

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
  range: string;
  note: string;
};

export type Win = { id: string; type: string; text: string; result: string; tpl: string; blanks: string[] };
export type Proc = { key: string; label: string; volume: string; role: string };

// One role at a company. A promotion within the same company is another position in the same job, not a new job.
export type Position = { id: string; title: string; level: string; start: string; end: string; current: boolean };

export type Job = {
  id: string;
  fromCv: boolean;
  checked: boolean; // the candidate has confirmed the company, roles and dates
  positions: Position[];
  noTarget: boolean;
  clients: string;
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
  processes: Proc[];
  stages: string[];
  tools: string[];
  process: string;
  leads: string[];
  composition: string[];
  wins: Win[];
  growth: { from: string; to: string; period: string };
  promoted: string;
  extra: string;
};

export type Basics = {
  name: string; email: string; phone: string; city: string; employer: string; title: string; expYears: number | null;
  education: string; educationDetail: string; educations: { degree: string; institution: string; year: string }[]; linkedin: string; status: string;
};

export type Targets = {
  roles: string; levels: string[]; industries: string[]; companyTypes: string[]; cities: string; relocate: string; travel: string;
  workMode: string; empType: string; notice: string; currentFixed: number | null; currentVariable: number | null;
  expectedFixed: number | null; expectedVariable: number | null; avoid: string; note: string;
};

export type Story = { strengths: string[]; style: string; knownFor: string; wantNext: string[]; headline: string };

export type Extras = { photoPref: string; certifications: string; languages: string[]; awards: string; cvPages: string; cvAvoid: string; confidential: boolean; gaps: string; anything: string };

export type CvData = { basics: Basics; jobs: Job[]; story: Story; targets: Targets; extras: Extras };

const MAX_JOBS = 10;

export const newId = () => Math.random().toString(36).slice(2, 10);

export function emptyJob(): Job {
  return {
    id: newId(), fromCv: false, checked: false, positions: [], noTarget: false, clients: "", employer: "", industry: "", city: "", start: "", end: "", current: false, title: "", fn: "", level: "",
    sells: "", model: [], customers: [], buyers: [], motion: [], channels: [], route: "", cycle: "", reportsTo: "", geography: "", metrics: [],
    manages: "", team: { direct: null, total: null, layers: "", hired: "", attrition: "", note: "" }, processes: [], stages: [], tools: [], process: "", leads: [], composition: [], wins: [],
    growth: { from: "", to: "", period: "" }, promoted: "", extra: "",
  };
}

export function emptyData(): CvData {
  return {
    basics: { name: "", email: "", phone: "", city: "", employer: "", title: "", expYears: null, education: "", educationDetail: "", educations: [], linkedin: "", status: "" },
    jobs: [],
    story: { strengths: [], style: "", knownFor: "", wantNext: [], headline: "" },
    targets: { roles: "", levels: [], industries: [], companyTypes: [], cities: "", relocate: "", travel: "", workMode: "", empType: "", notice: "", currentFixed: null, currentVariable: null, expectedFixed: null, expectedVariable: null, avoid: "", note: "" },
    extras: { photoPref: "", certifications: "", languages: [], awards: "", cvPages: "", cvAvoid: "", confidential: false, gaps: "", anything: "" },
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
    range: oneOf(m.range, RANGES_INR) || str(m.range, 60),
    note: str(m.note, 300),
  };
}

export function cleanJob(raw: unknown): Job {
  const j = rec(raw);
  const t = rec(j.team);
  const g = rec(j.growth);
  const current = j.current === true;
  const positions = sortPositions(
    (Array.isArray(j.positions) ? j.positions : []).slice(0, 6).map((p): Position => {
      const x = rec(p);
      const cur = x.current === true;
      return { id: id(x.id), title: str(x.title, 120), level: str(x.level, 80), start: month(x.start), end: cur ? "" : month(x.end), current: cur };
    }).filter((p) => p.title || p.start || p.level),
  );
  return syncJob({
    id: id(j.id),
    fromCv: j.fromCv === true,
    checked: j.checked === true,
    positions,
    noTarget: j.noTarget === true,
    clients: str(j.clients, 400),
    employer: str(j.employer, 120), industry: str(j.industry, 80), city: str(j.city, 80),
    start: month(j.start), end: current ? "" : month(j.end), current,
    title: str(j.title, 120), fn: str(j.fn, 80), level: str(j.level, 80),
    sells: text(j.sells), model: list(j.model, 6), customers: list(j.customers), buyers: list(j.buyers), motion: list(j.motion), channels: list(j.channels),
    route: oneOf(j.route, ROUTES), cycle: oneOf(j.cycle, CYCLES), reportsTo: str(j.reportsTo, 120), geography: str(j.geography, 200),
    metrics: (Array.isArray(j.metrics) ? j.metrics : []).slice(0, 16).map(cleanMetric),
    manages: j.manages === "yes" || j.manages === "no" ? j.manages : "",
    team: { direct: num(t.direct, 100000), total: num(t.total, 1000000), layers: str(t.layers, 40), hired: str(t.hired, 80), attrition: str(t.attrition, 80), note: str(t.note, 400) },
    processes: (Array.isArray(j.processes) ? j.processes : []).slice(0, 14).map((p) => {
      const x = rec(p);
      return { key: str(x.key, 40), label: str(x.label, 80) || PROCESS_LABEL[str(x.key, 40)] || "", volume: oneOf(x.volume, VOLUMES), role: oneOf(x.role, PROC_ROLES) };
    }).filter((p) => p.key),
    stages: list(j.stages, 8), tools: list(j.tools, 20), process: text(j.process), leads: list(j.leads, 10), composition: list(j.composition, 8),
    wins: (Array.isArray(j.wins) ? j.wins : []).slice(0, 4).map((w) => {
      const x = rec(w);
      return { id: id(x.id), type: str(x.type, 60), text: text(x.text), result: str(x.result, 400), tpl: str(x.tpl, 40), blanks: list(x.blanks, 6, 120) };
    }),
    growth: { from: str(g.from, 120), to: str(g.to, 120), period: str(g.period, 80) },
    promoted: str(j.promoted, 400), extra: text(j.extra),
  });
}

// ---- roles within a company ----

const roleKey = (p: Position) => `${p.current ? "1" : "0"}|${p.end || ""}|${p.start || ""}`;

/** Newest role first, by the dates given. Roles without dates keep the order they came in. */
export function sortPositions(ps: Position[]): Position[] {
  return ps.map((p, i) => ({ p, i })).sort((a, b) => (roleKey(a.p) < roleKey(b.p) ? 1 : roleKey(a.p) > roleKey(b.p) ? -1 : a.i - b.i)).map((x) => x.p);
}

/**
 * Keeps the job's own title, level and dates in step with its roles: the title and level are the latest role's, the start is
 * the first role's, and it is current if any role is. Nothing else in the form needs to know about roles to keep working.
 */
export function syncJob(j: Job): Job {
  let ps = j.positions;
  if (ps.length === 0 && (j.title || j.level || j.start || j.end || j.current)) ps = [{ id: newId(), title: j.title, level: j.level, start: j.start, end: j.end, current: j.current }];
  if (ps.length === 0) return { ...j, positions: [] };
  const latest = ps.reduce((a, b) => (roleKey(b) > roleKey(a) ? b : a), ps[0]);
  const starts = ps.map((p) => p.start).filter(Boolean).sort();
  const current = ps.some((p) => p.current);
  const ends = ps.filter((p) => !p.current).map((p) => p.end).filter(Boolean).sort();
  return { ...j, positions: ps, title: latest.title, level: latest.level, start: starts[0] ?? "", current, end: current ? "" : (ends[ends.length - 1] ?? "") };
}

const COMPANY_NOISE = new Set(["pvt", "ltd", "private", "limited", "inc", "llp", "corp", "corporation", "india", "co", "company", "the"]);
export const normEmployer = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !COMPANY_NOISE.has(w)).join(" ");

export type ParsedRole = { employer: string; title: string; city: string; start: string; end: string; current: boolean };

/**
 * Turns the roles read from a CV into jobs. Roles at the same company that follow each other are one job with several
 * roles (a promotion), not several jobs. If another company comes in between, it is a rejoin and stays a separate job.
 */
export function groupExperiences(parsed: ParsedRole[]): Job[] {
  const out: Job[] = [];
  for (const r of parsed) {
    const prev = out[out.length - 1];
    const same = prev && normEmployer(prev.employer) !== "" && normEmployer(prev.employer) === normEmployer(r.employer);
    const pos: Position = { id: newId(), title: r.title, level: "", start: r.start, end: r.current ? "" : r.end, current: r.current };
    if (same) prev.positions.push(pos);
    else out.push({ ...emptyJob(), fromCv: true, employer: r.employer, city: r.city, positions: [pos] });
  }
  return out.map((j) => syncJob({ ...j, positions: sortPositions(j.positions) }));
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
      expYears: num(b.expYears, 60), education: oneOf(b.education, EDUCATION), educationDetail: str(b.educationDetail, 300),
      educations: (Array.isArray(b.educations) ? b.educations : []).slice(0, 4).map((x) => { const e2 = rec(x); return { degree: str(e2.degree, 160), institution: str(e2.institution, 160), year: str(e2.year, 12) }; }).filter((x) => x.degree || x.institution),
      linkedin: str(b.linkedin, 300), status: oneOf(b.status, STATUSES),
    },
    jobs: (Array.isArray(r.jobs) ? r.jobs : []).slice(0, MAX_JOBS).map(cleanJob),
    story: { strengths: list(rec(r.story).strengths, 5, 60), style: str(rec(r.story).style, 80), knownFor: str(rec(r.story).knownFor, 300), wantNext: list(rec(r.story).wantNext, 6, 60), headline: str(rec(r.story).headline, 300) },
    targets: {
      ...d.targets,
      roles: str(t.roles, 400), levels: list(t.levels, 8), industries: list(t.industries, 15), companyTypes: list(t.companyTypes, 6), cities: str(t.cities, 300),
      relocate: oneOf(t.relocate, RELOCATE), travel: oneOf(t.travel, TRAVEL), workMode: oneOf(t.workMode, WORK_MODES), empType: oneOf(t.empType, EMP_TYPES), notice: oneOf(t.notice, NOTICE),
      currentFixed: pos(t.currentFixed), currentVariable: num(t.currentVariable, 1000), expectedFixed: pos(t.expectedFixed), expectedVariable: num(t.expectedVariable, 1000),
      avoid: str(t.avoid, 400), note: text(t.note),
    },
    extras: {
      photoPref: oneOf(e.photoPref, PHOTO_PREFS), certifications: str(e.certifications, 600), languages: list(e.languages, 12), awards: text(e.awards), cvPages: oneOf(e.cvPages, CV_PAGES), cvAvoid: str(e.cvAvoid, 600),
      confidential: e.confidential === true, gaps: text(e.gaps), anything: text(e.anything),
    },
  };
}

// ---- which number prompts show: the form stays short because each person sees only what fits their kind of selling ----

export type Preset = { key: string; label: string; kind: MetricKind; scope: Scope; hint: string };

const P = (key: string, label: string, kind: MetricKind, scope: Scope, hint: string): Preset => ({ key, label, kind, scope, hint });

// A leader if they say so, manage people, or (before they have chosen a level) their title clearly says so, so team size is never missed.
export const isLeader = (j: Job) =>
  LEADER_LEVELS.includes(j.level) || j.manages === "yes" || j.positions.some((p) => LEADER_LEVELS.includes(p.level) || (!p.level && LEADER_LEVELS.includes(suggestLevel(p.title)))) || (!j.level && LEADER_LEVELS.includes(suggestLevel(j.title)));

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
  return { id: newId(), key: p.key, label: p.label, kind: p.kind, amount: null, currency: p.kind === "money" ? "INR" : "", unit: p.kind === "money" ? "Lakh" : "", period: p.kind === "money" ? "Per year" : "", scope: p.scope, basis: "actual", range: "", note: "" };
}

// ---- reading it back ----

export const SCOPE_TEXT: Record<Scope, string> = { own: "personal", team: "team", business: "whole business" };

export function formatMetric(m: Metric): string {
  if (m.amount === null && !m.range) return "";
  const n = m.amount === null ? "" : m.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const v = m.amount === null ? m.range : m.kind === "percent" ? `${n}%` : m.kind === "count" ? n : `${m.currency === "INR" ? "₹" : m.currency + " "}${n}${m.unit ? " " + m.unit : ""}`;
  return [v, m.period && m.kind === "money" ? m.period.toLowerCase() : "", SCOPE_TEXT[m.scope], m.amount === null || m.basis === "estimate" ? "approximate" : ""].filter(Boolean).join(" · ");
}

export function monthLabel(ym: string): string {
  if (!/^\d{4}-\d{2}$/.test(ym)) return "";
  const [y, m] = ym.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}

export const jobPeriod = (j: Job) => [monthLabel(j.start), j.current ? "Present" : monthLabel(j.end)].filter(Boolean).join(" – ");

export const jobFilled = (j: Job) => !!(j.employer || j.title);


/**
 * A guess at the level from the job title, offered for one-tap confirmation and never applied on its own. Titles that can
 * mean either a seller or a manager (Account Manager, Business Development Manager) give no guess.
 */
export function suggestLevel(title: string): string {
  const t = title.toLowerCase();
  if (!t.trim()) return "";
  if (/\b(ceo|cxo|chief|founder|co-founder|managing director)\b/.test(t)) return "CXO / founder";
  if (/\b(vp|vice president|business head|country head|national head|head)\b/.test(t)) return "VP / business head";
  if (/\b(avp|director)\b/.test(t)) return "Director / AVP";
  if (/\b(senior manager|sr\.? manager|general manager|agm|dgm)\b/.test(t)) return "Senior manager";
  if (/\b(team lead|team leader|sales lead)\b/.test(t)) return "Team lead";
  if (/account/.test(t) && /manager/.test(t)) return "";
  if (/\b(regional|area|zonal|cluster|branch|national|sales|inside sales|field sales|channel sales) manager\b/.test(t)) return "Manager";
  if (/\bsenior\b.*\b(executive|associate|consultant|representative)\b/.test(t)) return "Senior executive";
  if (/\b(executive|associate|representative|specialist|consultant)\b/.test(t)) return "Executive / associate";
  return "";
}

// ---- the details a sales CV cannot do without, asked for proactively and checked the same way everywhere ----

export type KeyItem = { id: "role" | "sold" | "process" | "numbers" | "team" | "wins"; label: string; done: boolean };

export const hasNumber = (j: Job) => j.metrics.some((m) => m.amount !== null || !!m.range);

/** What a job still needs. Team size only counts for people who lead; sales processes only for the jobs asked in full. */
export function keyItems(j: Job, full = true): KeyItem[] {
  const out: KeyItem[] = [
    { id: "role", label: "Role, level and dates", done: !!(j.employer && j.title && j.start && j.level) },
    { id: "sold", label: "What you sold", done: j.sells.trim().length > 0 },
  ];
  if (full) out.push({ id: "process", label: "Sales processes", done: j.processes.length > 0 });
  out.push({ id: "numbers", label: "Revenue numbers", done: hasNumber(j) });
  if (isLeader(j)) out.push({ id: "team", label: "Team size", done: j.team.total !== null || j.team.direct !== null });
  out.push({ id: "wins", label: "An achievement", done: j.wins.some(winDone) });
  return out;
}

const moneyShort = (m: Metric): string => {
  if (m.amount === null) return m.range;
  const n = m.amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const u = m.unit === "Crore" ? " Cr" : m.unit === "Lakh" ? " L" : m.unit ? " " + m.unit.toLowerCase() : "";
  return `${m.currency === "INR" || !m.currency ? "₹" : m.currency + " "}${n}${u}`;
};
const targetPhrase = (p: string) => { const w = periodWord(p); return w ? `${/^[aeiou]/i.test(w) ? "an" : "a"} ${w} target` : "a target"; };
const periodWord = (p: string) => (p === "Per month" ? "monthly" : p === "Per quarter" ? "quarterly" : p === "Per year" ? "annual" : "");
const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const lc = (x: string) => x.charAt(0).toLowerCase() + x.slice(1);

export type PreviewLine = { text: string; ghost?: boolean };

/** How this job will read on the CV, built only from what the candidate entered. Missing parts show as grey prompts. */
export function describeJob(j: Job, full = true): { head: string; sub: string; lines: PreviewLine[] } {
  const head = [j.title, j.employer].filter(Boolean).join(", ") || "Your job title, company";
  const sub = [jobPeriod(j), j.city].filter(Boolean).join(" · ");
  const lines: PreviewLine[] = [];
  if (j.positions.length > 1) {
    const ps = sortPositions(j.positions);
    const first = ps[ps.length - 1];
    const last = ps[0];
    if (first.title && last.title && first.title !== last.title) lines.push({ text: `Progressed from ${first.title} to ${last.title}.` });
  }
  const to = j.customers.length ? ` to ${joinList(j.customers.map(lc))}` : "";
  lines.push(j.sells.trim() ? { text: `Sold ${j.sells.trim().replace(/\.$/, "")}${to}${j.model.length ? ` (${j.model.join(", ")})` : ""}.` } : { text: "What you sold, and to whom", ghost: true });
  if (j.clients.trim()) lines.push({ text: `Customers included ${j.clients.trim().replace(/\.$/, "")}.` });
  if (full) {
    const by = (g: string) => PROCESS_GROUPS.find((x) => x.group === g)!.items.filter((i) => j.processes.some((p) => p.key === i.key)).map((i) => lc(i.label));
    const parts = PROCESS_GROUPS.map((g) => ({ g: g.group, items: by(g.group) })).filter((x) => x.items.length);
    lines.push(parts.length ? { text: `Ran ${joinList(parts.map((x) => `${x.g.toLowerCase()} (${joinList(x.items)})`))}.` } : { text: "The sales processes you ran (inbound, outbound...)", ghost: true });
  }
  const get = (k: string) => j.metrics.find((m) => m.key === k && (m.amount !== null || m.range));
  const target = get("target");
  const got = get("achieved");
  if (got && target && got.amount !== null && target.amount !== null && target.amount > 0 && got.unit === target.unit && got.currency === target.currency) {
    // Rounded in two steps so 87.5 does not become 87 through floating point.
    const pct = Math.round(Math.round((got.amount / target.amount) * 1000) / 10);
    lines.push({ text: `Achieved ${moneyShort(got)} against ${targetPhrase(target.period)} of ${moneyShort(target)} (${pct}%).` });
  } else if (got) lines.push({ text: `Achieved ${moneyShort(got)}${periodWord(got.period) ? ` ${periodWord(got.period)}` : ""}${got.amount === null || got.basis === "estimate" ? " (approx.)" : ""}.` });
  else if (target) lines.push({ text: `Carried ${targetPhrase(target.period)} of ${moneyShort(target)}.` });
  else if (!j.metrics.some((m) => m.key !== "target" && m.key !== "achieved" && (m.amount !== null || !!m.range) && m.label)) lines.push({ text: j.noTarget ? "Your volume numbers (calls, leads, deals)" : "Your revenue numbers: target and what you achieved", ghost: true });
  for (const m of j.metrics) {
    if ((m.key === "target" || m.key === "achieved") || (m.amount === null && !m.range) || !m.label) continue;
    lines.push({ text: `${m.label}: ${formatMetric(m)}.` });
  }
  if (isLeader(j)) {
    const t = j.team;
    const size = t.total ?? t.direct;
    if (size !== null) {
      const bits = [t.direct !== null && t.total !== null && t.direct !== t.total ? `${t.direct} direct reports` : "", t.hired ? `hired ${t.hired}` : "", t.attrition ? `attrition ${t.attrition}` : ""].filter(Boolean);
      lines.push({ text: `Led a team of ${size}${j.composition.length ? ` (${joinList(j.composition.map(lc))})` : ""}${bits.length ? `: ${bits.join(", ")}` : ""}.` });
    } else lines.push({ text: "Your team size", ghost: true });
  }
  const wins = j.wins.filter(winDone);
  if (wins.length) wins.forEach((w) => lines.push({ text: `${w.text.replace(/\.$/, "")}${w.result ? `: ${w.result}` : ""}.` }));
  else lines.push({ text: "An achievement you are proud of", ghost: true });
  return { head, sub, lines };
}

/** Suggestions, never errors: what is still missing in their latest two jobs, plus what they want next. */
export function gaps(d: CvData): string[] {
  const out: string[] = [];
  const jobs = d.jobs.filter(jobFilled);
  if (!jobs.length) out.push("Add at least your current or latest job.");
  jobs.slice(0, 2).forEach((j, i) => {
    const who = j.employer || j.title || `Job ${i + 1}`;
    for (const k of keyItems(j, true)) if (!k.done) out.push(`${who}: ${k.label.toLowerCase()}.`);
  });
  if (!d.targets.roles.trim()) out.push("The role you are looking for.");
  if (!d.basics.linkedin.trim()) out.push("Your LinkedIn link.");
  return out;
}

/** How complete the details a sales CV needs are, 0 to 100: the key items of the latest two jobs, plus the basics and what they want next. */
export function progress(d: CvData): number {
  const jobs = d.jobs.filter(jobFilled).slice(0, 2);
  const items = jobs.flatMap((j, i) => keyItems(j, i < 2).map((k) => k.done));
  if (!jobs.length) items.push(false, false, false, false);
  items.push(!!(d.basics.name && d.basics.email && d.basics.phone), !!d.targets.roles.trim(), d.targets.cities.trim() !== "" || d.targets.relocate !== "");
  return Math.round((items.filter(Boolean).length / items.length) * 100);
}
