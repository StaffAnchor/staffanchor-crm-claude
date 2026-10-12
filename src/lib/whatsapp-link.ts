// Click-to-chat links: opens WhatsApp Web (or the app on a phone) with a
// message already typed in, so a recruiter only has to press Send. Needs no
// Meta credentials -- it's the bridge until the Cloud API integration in
// whatsapp.ts is switched on.

/** Indian numbers are stored as bare 10 digits; add 91. Anything longer already has a country code. */
export function whatsappDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = phone ? whatsappDigits(phone) : null;
  if (!digits) return null;
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
}

// Every link opens in this one named tab, so repeated clicks reuse it
// instead of piling up new tabs.
export const WHATSAPP_TARGET = "staffanchor-whatsapp";

export type WhatsAppTemplate = { key: string; label: string; text: string };

export const firstNameOf = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "there";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://clients.staffanchor.com";

// What we can ask a candidate for, in plain words, whichever naming the screen uses for it.
const ASK: Record<string, string> = {
  current_ctc: "current CTC",
  current_fixed_ctc: "current CTC",
  expected_ctc: "expected CTC",
  expected_fixed_ctc: "expected CTC",
  notice: "notice period",
  notice_period: "notice period",
  title: "current role",
  current_job_title: "current role",
  employer: "current company",
  current_employer: "current company",
  city: "current city",
  current_location: "current city",
  experience: "total experience",
  total_experience_years: "total experience",
  email: "email address",
  cv: "latest CV",
  resume_file_url: "latest CV",
};

export type TemplateContext = {
  /** The signed-in team member's first name, so each person's message carries their own name. */
  me?: string | null;
  candidateId?: string | null;
  /** What is missing from this profile, as readiness keys or profile column names. */
  missing?: string[];
  /** The role being discussed, when there is one. */
  role?: string | null;
};

export const humanList = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}` : items[0] ?? "");

export function askedFor(missing: string[] | undefined): string[] {
  return Array.from(new Set((missing ?? []).map((k) => ASK[k]).filter(Boolean))).slice(0, 5);
}

export function candidateTemplates(name: string | null | undefined, ctx: TemplateContext = {}): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  const me = (ctx.me ?? "").trim();
  const who = me ? `this is ${me} from StaffAnchor Talent Solutions, a recruitment firm` : "this is from StaffAnchor Talent Solutions, a recruitment firm";
  const sign = me ? `${me}, StaffAnchor` : "StaffAnchor";
  const wa = ctx.candidateId ? `${APP_URL}/w/${ctx.candidateId}` : null;
  const form = ctx.candidateId ? `${APP_URL}/u/${ctx.candidateId}` : null;
  const asks = askedFor(ctx.missing);
  const forRole = ctx.role ? ` for the ${ctx.role} role` : "";
  const routes = wa && form ? `\n\nPlease confirm by messaging our official WhatsApp: ${wa}\nor complete your profile here: ${form}` : "";
  const out: WhatsAppTemplate[] = [];
  if (asks.length > 0) {
    out.push({
      key: "complete",
      label: "Missing details, with links",
      text: `Hi ${n}, ${who}. While evaluating your profile${forRole}, I noticed these details are missing: ${humanList(asks)}.${routes || "\n\nCould you please share them here?"}\n\nThank you!`,
    });
  }
  if (ctx.role) {
    out.push({
      key: "role",
      label: `${ctx.role}: opportunity`,
      text: `Hi ${n}, ${who}. Your profile looks relevant for ${/^[aeiou]/i.test(ctx.role) ? "an" : "a"} ${ctx.role} opportunity we are hiring for. Would you like to know more?${routes ? `\n\nReply here, message our official WhatsApp: ${wa}\nor complete your profile so we can present you well: ${form}` : ""}\n\n${sign}`,
    });
  }
  return [
    ...out,
    {
      key: "intro",
      label: "Introduce an opportunity",
      text: `Hi ${n}, ${who}. I came across your profile and have an opportunity I'd like to discuss. Do you have 5 minutes for a quick call today?`,
    },
    {
      key: "cv",
      label: "Ask for updated CV",
      text: `Hi ${n}, could you please share your updated CV here (PDF or Word)? Thanks, ${sign}`,
    },
    {
      key: "details",
      label: "Confirm CTC and notice period",
      text: `Hi ${n}, following up on our call. Could you please confirm your current CTC, expected CTC, notice period and preferred work mode? Thanks, ${sign}`,
    },
    {
      key: "interview",
      label: "Interview reminder",
      text: `Hi ${n}, a quick reminder about your upcoming interview. Please confirm you're all set and reply here if anything changes. Thanks, ${sign}`,
    },
    {
      key: "followup",
      label: "Gentle follow-up",
      text: `Hi ${n}, just checking in on the opportunity I shared. Are you still interested? Happy to answer any questions.${wa ? ` You can also reach us on our official WhatsApp: ${wa}` : ""}\n\n${sign}`,
    },
  ];
}

export function employerTemplates(name: string | null | undefined, role?: string | null): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  const about = role ? `hiring for ${role}` : "your hiring requirement";
  return [
    {
      key: "thanks",
      label: "Thanks for reaching out",
      text: `Hi ${n}, thanks for reaching out to StaffAnchor about ${about}. Once we confirm the brief, we share the first shortlist within 72 hours. When is a good time for a 10-minute call to understand the role?`,
    },
    {
      key: "nudge",
      label: "Follow up",
      text: `Hi ${n}, following up on your enquiry about ${about}. Happy to get started whenever you're ready. Would a quick call today or tomorrow work? StaffAnchor`,
    },
  ];
}

export function jobseekerTemplates(name: string | null | undefined): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  return [
    {
      key: "reply",
      label: "Acknowledge their message",
      text: `Hi ${n}, thanks for writing to StaffAnchor. We've received your message and will get back to you shortly. If it's urgent, please reply here with details.`,
    },
    {
      key: "cv",
      label: "Ask for CV",
      text: `Hi ${n}, thanks for reaching out to StaffAnchor. Could you please share your latest CV here (PDF or Word) so we can look at suitable roles? Thanks`,
    },
  ];
}

export type PipelineContext = TemplateContext & {
  /** This person's stage on this role: sourced, screened, submitted, client_interview, ... */
  stage?: string | null;
  cities?: string[] | null;
  workMode?: string | null;
};

const EARLY = new Set(["sourced", "screened", "shortlisted"]);

/**
 * Messages for someone in a specific role's pipeline. They use the role, its location and work mode, and
 * the person's stage, and never the client's name (who the client is stays with us until the right moment).
 */
export function pipelineTemplates(name: string | null | undefined, ctx: PipelineContext): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  const me = (ctx.me ?? "").trim();
  const who = me ? `this is ${me} from StaffAnchor Talent Solutions, a recruitment firm` : "this is from StaffAnchor Talent Solutions, a recruitment firm";
  const sign = me ? `${me}, StaffAnchor` : "StaffAnchor";
  const role = ctx.role?.trim() || "the role we spoke about";
  const roleRef = ctx.role?.trim() ? `the ${ctx.role.trim()} role` : "the role we discussed";
  const where = ctx.cities && ctx.cities.length > 0 ? ` in ${humanList(ctx.cities.slice(0, 3))}` : "";
  const mode = ctx.workMode ? ` (${ctx.workMode.toLowerCase()})` : "";
  const wa = ctx.candidateId ? `${APP_URL}/w/${ctx.candidateId}` : null;
  const form = ctx.candidateId ? `${APP_URL}/u/${ctx.candidateId}` : null;
  const asks = askedFor(ctx.missing);
  const routes = wa && form ? `\n\nPlease reply here, message our official WhatsApp: ${wa}\nor complete your profile: ${form}` : "";
  const stage = ctx.stage ?? "sourced";

  const t: Record<string, WhatsAppTemplate> = {
    role_check: {
      key: "role_check",
      label: "Check interest in this role",
      text: `Hi ${n}, ${who}. You are being considered for ${roleRef}${where}${mode}. Are you open to it? ${asks.length ? `To take it forward, please confirm your ${humanList(asks)}.` : "If yes, please share a convenient time for a quick call."}${routes}\n\n${sign}`,
    },
    missing: {
      key: "missing",
      label: "Missing details for this role",
      text: `Hi ${n}, ${who}. For ${roleRef}, I still need these details from you: ${humanList(asks)}.${routes}\n\nThank you!\n${sign}`,
    },
    call: {
      key: "call",
      label: "Schedule a quick call",
      text: `Hi ${n}, ${who}. Regarding ${roleRef}, could we have a 10-minute call today or tomorrow? Please share a time that suits you.\n\n${sign}`,
    },
    summary: {
      key: "summary",
      label: "Role summary",
      text: `Hi ${n}, ${who}. A quick summary of ${roleRef}:\n\nRole: ${role}${where ? `\nLocation:${where.replace(" in", "")}` : ""}${ctx.workMode ? `\nWork mode: ${ctx.workMode}` : ""}\n\nIf this interests you, please reply here and we will share more details.\n\n${sign}`,
    },
    submitted: {
      key: "submitted",
      label: "Update: profile shared",
      text: `Hi ${n}, a quick update on ${roleRef}: your profile has been shared with the hiring team. I will let you know as soon as we hear back.\n\n${sign}`,
    },
    interview: {
      key: "interview",
      label: "Confirm interview availability",
      text: `Hi ${n}, regarding your interview for ${roleRef}: please confirm you are available and reply here if anything changes. Wishing you the best!\n\n${sign}`,
    },
    next: {
      key: "next",
      label: "Next steps",
      text: `Hi ${n}, there is positive movement on ${roleRef}. Could we speak today about the next steps? Please share a time that works for you.\n\n${sign}`,
    },
    joining: {
      key: "joining",
      label: "Joining reminder",
      text: `Hi ${n}, a quick note ahead of your joining for ${roleRef}. Please confirm your joining date and let me know if you need anything from our side.\n\n${sign}`,
    },
    closure: {
      key: "closure",
      label: "Polite closure",
      text: `Hi ${n}, thank you for your time and interest in ${roleRef}. The hiring team has decided to move ahead with other profiles for now. We will keep your profile in mind for suitable roles.\n\n${sign}`,
    },
    followup: {
      key: "followup",
      label: "Gentle follow-up",
      text: `Hi ${n}, following up on ${roleRef}. Are you still interested? Happy to answer any questions.${wa ? ` You can also reach us on our official WhatsApp: ${wa}` : ""}\n\n${sign}`,
    },
  };

  let order: string[];
  if (EARLY.has(stage)) order = [...(asks.length ? ["missing"] : []), "role_check", "call", "summary", "followup"];
  else if (stage === "submitted") order = ["submitted", ...(asks.length ? ["missing"] : []), "followup"];
  else if (stage === "client_interview") order = ["interview", "call", "followup"];
  else if (stage === "client_shortlisted" || stage === "offer") order = ["next", "call", "followup"];
  else if (stage === "placed") order = ["joining", "followup"];
  else if (stage === "rejected" || stage === "pulled_back") order = ["closure", "followup"];
  else order = ["role_check", "call", "followup"];
  return order.map((k) => t[k]).filter(Boolean);
}
