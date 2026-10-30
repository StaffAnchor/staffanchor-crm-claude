// Why a person is not a fit for a role. The codes are what the system stores and learns from.
// "role" reasons are about this one role only. "person" reasons describe the candidate themselves, so they are
// remembered against the candidate and lower their ranking on every other role too.
export type NotAFitReason = { value: string; title: string; hint: string; icon: string; tone: string; scope: "role" | "person" };

export const NOT_A_FIT_REASONS: NotAFitReason[] = [
  { value: "wrong_role", title: "Different kind of job", hint: "Does another job, not this one (for example support, not sales)", icon: "briefcase", tone: "text-violet-600 bg-violet-50", scope: "role" },
  { value: "wrong_level", title: "Wrong seniority", hint: "Too junior or too senior for this role", icon: "layers", tone: "text-sky-600 bg-sky-50", scope: "role" },
  { value: "wrong_world", title: "Sells something else", hint: "Different product or buyers than this role needs", icon: "tag", tone: "text-amber-600 bg-amber-50", scope: "role" },
  { value: "wrong_city", title: "Location doesn't work", hint: "Based elsewhere and not open to moving", icon: "pin", tone: "text-emerald-600 bg-emerald-50", scope: "role" },
  { value: "pay_too_high", title: "Pay too high", hint: "Expects more than the budget", icon: "rupee", tone: "text-rose-600 bg-rose-50", scope: "role" },
  { value: "not_interested", title: "Not interested", hint: "Said no, or is not looking right now", icon: "phone", tone: "text-slate-600 bg-slate-100", scope: "role" },
  { value: "lead_gen_only", title: "Lead generation only", hint: "Books meetings or qualifies leads, doesn't close", icon: "funnel", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "no_quota", title: "Doesn't own a quota", hint: "Supports sales or sells without a personal target", icon: "target", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "no_closing", title: "Hasn't closed deals alone", hint: "Assists or hands off; no end-to-end closing", icon: "handshake", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "non_saas", title: "Not SaaS or software", hint: "Sells hardware, services, insurance, real estate, etc.", icon: "cloud", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "small_deals", title: "Only small or SMB deals", hint: "No mid-market or enterprise ticket sizes", icon: "coins", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "no_hunting", title: "No outbound hunting", hint: "Inbound, farming or account management only", icon: "magnet", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "job_hopper", title: "Changes jobs too often", hint: "Short stints across several employers", icon: "shuffle", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "communication", title: "Communication isn't strong", hint: "Spoken or written, as seen on the call or CV", icon: "message", tone: "text-indigo-600 bg-indigo-50", scope: "person" },
  { value: "other", title: "Other", hint: "Something else", icon: "dots", tone: "text-slate-600 bg-slate-100", scope: "role" },
];

export const NOT_A_FIT_CODES = NOT_A_FIT_REASONS.map((r) => r.value);
export const PERSON_FLAGS = NOT_A_FIT_REASONS.filter((r) => r.scope === "person").map((r) => r.value);
export const notAFitLabel = (code: string) => NOT_A_FIT_REASONS.find((r) => r.value === code)?.title ?? code;
