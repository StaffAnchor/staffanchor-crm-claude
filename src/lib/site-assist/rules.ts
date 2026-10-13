// Reads what a website visitor typed and works out who they are and what they want, using plain rules
// only: no AI, no network. It is the first layer. When it is sure, the AI layer is not called at all (so
// obvious messages are instant and free); when it is not sure, the AI layer reads the message properly.
// This file imports nothing so it can also run in the browser for demos and tests.

export type Intent = "jobseeker" | "employer" | "referrer" | "vendor" | "status" | "privacy" | "other";

export type Entities = {
  role?: string;
  city?: string;
  headcount?: number;
  experienceYears?: number;
  urgent?: boolean;
};

export type RuleResult = {
  intent: Intent | null;
  confidence: number;
  entities: Entities;
  signals: string[];
};

const CITIES = [
  "Bangalore", "Bengaluru", "Mumbai", "Delhi", "New Delhi", "Gurgaon", "Gurugram", "Noida", "Hyderabad", "Chennai",
  "Pune", "Kolkata", "Ahmedabad", "Jaipur", "Chandigarh", "Kochi", "Indore", "Lucknow", "Coimbatore", "Nagpur",
  "Ghaziabad", "Faridabad", "Surat", "Vadodara", "Bhopal", "Thane", "Navi Mumbai", "Remote",
];

const ROLES: [RegExp, string][] = [
  [/\b(vp|vice president)\s+(of\s+)?sales\b/i, "VP of Sales"],
  [/\b(national|regional|zonal|country|business)\s+(sales\s+)?head\b/i, "Sales Head"],
  [/\bsales\s+(head|director|manager|lead|executive|leader)s?\b/i, "Sales leader"],
  [/\b(enterprise|strategic|key)\s+account\s+(executive|manager)s?\b/i, "Enterprise Account Executive"],
  [/\baccount\s+(executive|manager)s?\b/i, "Account Executive"],
  [/\b(sdrs?|bdrs?|sales development)\b/i, "SDR / BDR"],
  [/\b(bdm|business development( manager| executive)?)s?\b/i, "Business Development"],
  [/\binside sales\b/i, "Inside Sales"],
  [/\b(customer success|csm)\b/i, "Customer Success"],
  [/\bpre-?sales\b/i, "Pre-sales"],
  [/\b(saas|software|tech) sales\b/i, "SaaS sales"],
  [/\b(marketing|hr|finance|operations|product|engineer|developer|designer|accountant)\b/i, ""],
];

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

function cityOf(t: string): string | undefined {
  const sorted = [...CITIES].sort((a, b) => b.length - a.length);
  for (const c of sorted) if (new RegExp(`\\b${c.replace(/ /g, "\\s+")}\\b`, "i").test(t)) return c === "Bengaluru" ? "Bangalore" : c === "Gurugram" ? "Gurgaon" : c;
  return undefined;
}

function roleOf(t: string): string | undefined {
  for (const [re, label] of ROLES) {
    if (label && re.test(t)) return label;
  }
  return undefined;
}

function headcountOf(t: string): number | undefined {
  const m = /\b(?:hire|hiring|need|require|looking for|want)\s+(?:about\s+|around\s+)?(\d{1,3})\b/i.exec(t) ?? /\b(\d{1,3})\s+(?:sdrs?|bdrs?|aes?|managers?|executives?|people|candidates?|sales|reps?|openings?|positions?)\b/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 && n <= 500 ? n : undefined;
}

function experienceOf(t: string): number | undefined {
  const m = /\b(\d{1,2})(?:\+)?\s*(?:years?|yrs?)\b/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 45 ? n : undefined;
}

// Phrases in plain English, with the Hinglish people actually type.
const EMPLOYER = /\b(we(?:'| a)?re hiring|we are hiring|we need to hire|looking to hire|want to hire|need to hire|hir(?:e|ing) kar(?:na|ni|ne|o)?|(?:is|are) hiring|vacanc(?:y|ies)|our requirement|requirement for|need (?:a |an |some )?(?:\d+ )?(?:sales|sdrs?|bdrs?|account|manager|head|candidates?|people|team)|looking for (?:a |an |some )?(?:\d+ )?(?:sales head|candidates?|sdrs?|account executives?)|our company|my company|our team needs|bulk hiring|hire (?:a|an|\d+)|hiring (?:a|an|for|\d+)|rpo|headhunt|mandate)\b/i;
const JOBSEEKER = /\b(i(?:'| a)?m looking for (?:a |an )?(?:new )?(?:job|role|opportunit|position|change)|looking for (?:a )?(?:job|new role|new opportunit|change)|need a job|want a job|job chahiye|naukri chahiye|job dhund|job search|find me a job|open to (?:new )?(?:roles|opportunit)|my cv|my resume|my profile|apply for|applied for|switch(?:ing)? (?:job|jobs|roles|company)|career change|fresher|available to join|notice period|current ctc|expected ctc)\b/i;
const REFERRER = /\b(refer|referral|referrer|sales circle|partner with you|earn (?:by|through) refer|introduce (?:candidates|people)|recommend (?:candidates|people))\b/i;
const VENDOR = /\b(staffing (?:agency|firm|company|partner)|recruitment (?:agency|firm|partner)|we(?:'| a)?re an? (?:agency|vendor|consultancy)|vendor|empanel|empanelment|white-?label|collaborate on mandates|supply (?:candidates|profiles))\b/i;
const STATUS = /\b(status of my|my application status|where is my application|any update on my|update on my application|have you shortlisted me|did (?:the )?client (?:respond|reply)|follow up on my|haven't heard back|no response from you)\b/i;
const PRIVACY = /\b(delete my (?:data|profile|account|details)|remove my (?:data|profile|details|number|email)|unsubscribe|stop (?:messag(?:es|ing)|emails?|emailing|calling|contacting|texting)|do not (?:call|contact|message)|don'?t (?:call|contact|message)|opt out|privacy|gdpr|dpdp|data protection|complaint|harass|fraud|scam)\b/i;

export function runRules(text: string): RuleResult {
  const t = norm(text);
  const entities: Entities = {};
  const role = roleOf(t);
  const city = cityOf(t);
  const headcount = headcountOf(t);
  const experienceYears = experienceOf(t);
  if (role) entities.role = role;
  if (city) entities.city = city;
  if (headcount) entities.headcount = headcount;
  if (experienceYears !== undefined) entities.experienceYears = experienceYears;
  if (/\b(urgent|urgently|asap|immediately|immediate|this week|right away)\b/i.test(t)) entities.urgent = true;

  const signals: string[] = [];
  const hit = {
    privacy: PRIVACY.test(t),
    status: STATUS.test(t),
    vendor: VENDOR.test(t),
    referrer: REFERRER.test(t),
    employer: EMPLOYER.test(t),
    jobseeker: JOBSEEKER.test(t),
  };
  for (const [k, v] of Object.entries(hit)) if (v) signals.push(k);

  if (t.length < 3) return { intent: null, confidence: 0, entities, signals };

  // Privacy requests are always handled by a person, whatever else the message says.
  if (hit.privacy) return { intent: "privacy", confidence: 0.95, entities, signals };

  const kinds = (["status", "vendor", "referrer", "employer", "jobseeker"] as const).filter((k) => hit[k]);
  if (kinds.length === 1) {
    const intent = kinds[0];
    // A bare keyword is a signal, not a certainty: the more it says, the surer we are.
    const detail = Number(!!role) + Number(!!city) + Number(!!headcount) + Number(experienceYears !== undefined);
    const confidence = Math.min(0.96, 0.78 + 0.06 * detail + (t.length > 40 ? 0.04 : 0));
    return { intent, confidence, entities, signals };
  }
  if (kinds.length === 0) {
    // No wording matched. A role and a city alone ("sales head noida") is ambiguous: hiring or seeking.
    return { intent: null, confidence: 0, entities, signals };
  }
  // Two or more intents at once ("I need a job and my friend is hiring"): let the AI layer or the visitor decide.
  return { intent: null, confidence: 0.3, entities, signals };
}

/** One sentence saying what we understood, built only from structured parts, never free text. */
export function understoodSentence(intent: Intent, e: Entities): string {
  const where = e.city ? ` in ${e.city}` : "";
  const what = e.role ? `${e.role}` : "";
  switch (intent) {
    case "employer": {
      const who = e.headcount ? ` ${e.headcount} ${what || "people"}` : what ? ` a ${what}` : "";
      return `You are hiring${who}${where}${e.urgent ? ", and it is urgent" : ""}.`;
    }
    case "jobseeker":
      return `You are looking for ${what ? `a ${what} role` : "a new role"}${where}${e.experienceYears !== undefined ? ` with ${e.experienceYears} years of experience` : ""}.`;
    case "referrer":
      return "You would like to refer candidates or partner with us.";
    case "vendor":
      return "You run a staffing or recruitment agency and want to work together.";
    case "status":
      return "You are asking about the status of an application.";
    case "privacy":
      return "You have a privacy or data request.";
    default:
      return "";
  }
}
