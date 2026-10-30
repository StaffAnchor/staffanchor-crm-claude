// Why a person is not a fit for a role, and what the team learns about a seller. The codes are what the system stores and
// learns from, so they stay stable; titles and hints are only wording.
//  - "role" reasons are about this one role only.
//  - "person" reasons describe the candidate, so they are remembered against them and lower their ranking on every role.
//  - "strength" marks are positive and raise their ranking (set from the candidate's Seller notes).
export type NotAFitScope = "role" | "person" | "strength";
export type NotAFitReason = { value: string; title: string; hint: string; icon: string; tone: string; scope: NotAFitScope; category: string };

export const CATEGORY_LABEL: Record<string, string> = {
  role: "Not right for this role",
  selling: "How they sell",
  track: "Track record and stability",
  people: "Communication and attitude",
  strength: "Strengths",
};

const IND = "text-indigo-600 bg-indigo-50";
const R = (value: string, title: string, hint: string, icon: string, tone: string, scope: NotAFitScope, category: string): NotAFitReason => ({ value, title, hint, icon, tone, scope, category });

export const NOT_A_FIT_REASONS: NotAFitReason[] = [
  R("wrong_role", "Different kind of job", "Does another job, not this one (for example support, not sales)", "briefcase", "text-violet-600 bg-violet-50", "role", "role"),
  R("wrong_level", "Wrong seniority", "Too junior or too senior for this role", "layers", "text-sky-600 bg-sky-50", "role", "role"),
  R("wrong_world", "Sells something else", "Different product or buyers than this role needs", "tag", "text-amber-600 bg-amber-50", "role", "role"),
  R("wrong_city", "Location doesn't work", "Based elsewhere and not open to moving", "pin", "text-emerald-600 bg-emerald-50", "role", "role"),
  R("pay_too_high", "Pay too high", "Expects more than the budget", "rupee", "text-rose-600 bg-rose-50", "role", "role"),
  R("notice_long", "Notice period too long", "Can't join in the time the client wants", "clock", "text-slate-600 bg-slate-100", "role", "role"),
  R("not_interested", "Not interested", "Said no, or is not looking right now", "phone", "text-slate-600 bg-slate-100", "role", "role"),

  R("lead_gen_only", "Lead generation only", "Books meetings or qualifies leads, doesn't close", "funnel", IND, "person", "selling"),
  R("no_quota", "Doesn't own a quota", "Supports sales or sells without a personal target", "target", IND, "person", "selling"),
  R("no_closing", "Hasn't closed deals alone", "Assists or hands off; no end-to-end closing", "handshake", IND, "person", "selling"),
  R("no_hunting", "No outbound hunting", "Inbound, farming or account management only", "magnet", IND, "person", "selling"),
  R("non_saas", "Not SaaS or software", "Sells hardware, services, insurance, real estate, etc.", "cloud", IND, "person", "selling"),
  R("small_deals", "Only small or SMB deals", "No mid-market or enterprise ticket sizes", "coins", IND, "person", "selling"),
  R("short_cycles", "Only short, transactional sales", "No long, multi-stakeholder deal cycles", "timer", IND, "person", "selling"),
  R("single_geo", "Local market only", "No outside-India, multi-region or global selling", "globe", IND, "person", "selling"),

  R("job_hopper", "Changes jobs too often", "Short stints across several employers", "shuffle", IND, "person", "track"),
  R("no_proof", "Targets and results not shown", "No numbers on quota, revenue or achievement", "chart", IND, "person", "track"),
  R("cv_unclear", "CV unclear or doesn't add up", "Dates, titles or claims that can't be verified", "doc", IND, "person", "track"),

  R("communication", "Communication isn't strong", "Spoken or written, as seen on the call or CV", "message", IND, "person", "people"),
  R("low_drive", "Low drive or energy", "Doesn't come across as hungry for the role", "battery", IND, "person", "people"),
  R("unrealistic", "Unrealistic expectations", "Pay or role expectations well out of line with the profile", "scale", IND, "person", "people"),
  R("unresponsive", "Hard to reach", "Doesn't pick up or reply", "ghost", IND, "person", "people"),

  R("strong_closer", "Strong closer", "Closes deals end to end with proof", "star", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("hunter", "Proven hunter", "Builds pipeline from scratch, outbound", "magnet", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("enterprise", "Enterprise exposure", "Large, multi-stakeholder deals", "coins", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("saas_native", "SaaS native", "Has only sold software, and well", "cloud", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("quota_proven", "Consistent quota achiever", "Hits targets year after year", "target", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("great_comm", "Excellent communicator", "Clear, confident, client-ready", "message", "text-emerald-700 bg-emerald-50", "strength", "strength"),
  R("stable", "Stable tenures", "Stays and grows in roles", "anchor", "text-emerald-700 bg-emerald-50", "strength", "strength"),

  R("other", "Other", "Something else", "dots", "text-slate-600 bg-slate-100", "role", "role"),
];

export const NOT_A_FIT_CODES = NOT_A_FIT_REASONS.map((r) => r.value);
export const PERSON_FLAGS = NOT_A_FIT_REASONS.filter((r) => r.scope === "person").map((r) => r.value);
export const STRENGTH_FLAGS = NOT_A_FIT_REASONS.filter((r) => r.scope === "strength").map((r) => r.value);
export const notAFitLabel = (code: string) => NOT_A_FIT_REASONS.find((r) => r.value === code)?.title ?? code;
