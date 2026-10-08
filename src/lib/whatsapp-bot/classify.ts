// Decides who a WhatsApp conversation is with, from what they wrote. Who someone is
// beats what they typed (the engine checks the database first), and a person's
// answer to the 1/2/3 menu beats both.
export type ContactKind = "jobseeker" | "employer" | "referrer" | "other" | "unsorted";

const EMPLOYER = /\b(hire|hiring|we are hiring|looking to hire|need to hire|recruit(?:ing|ment)? (?:for|a|an|some)|vacanc(?:y|ies)|manpower|staffing|bulk hiring|need (?:a |an |some )?(?:sales|candidates?|employees?|team)|our company|my company|our requirement|requirement for)\b/i;
const JOBSEEKER = /\b(job|jobs|role|roles|opening|openings|opportunit(?:y|ies)|applied|application|registered|registration|my profile|profile|cv|resume|naukri|career|interview|looking for (?:a |an )?(?:new )?(?:role|job|opportunity)|new roles?|job description)\b/i;
const STRONG_JOBSEEKER = /\b(applied|my cv|my resume|my profile|looking for (?:a |an )?(?:new )?(?:role|job)|new roles?|registered on|job description)\b/i;
const REFERRER = /\b(sales circle|referrer|referral partner|i (?:just )?(?:submitted|made) a referral)\b/i;

export function classifyText(text: string | null | undefined): Exclude<ContactKind, "unsorted"> | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  if (REFERRER.test(t)) return "referrer";
  const emp = EMPLOYER.test(t);
  const job = JOBSEEKER.test(t);
  if (emp && !STRONG_JOBSEEKER.test(t)) return "employer";
  if (job && !emp) return "jobseeker";
  return null; // unclear, or both: ask with the menu
}

/** The 1 / 2 / 3 menu reply. */
export function parseMenuChoice(text: string | null | undefined): Exclude<ContactKind, "unsorted" | "referrer"> | null {
  const t = (text ?? "").trim().toLowerCase();
  if (/^1\b/.test(t) || /^(job|jobs|job seeker|jobseeker|looking for a job)$/.test(t)) return "jobseeker";
  if (/^2\b/.test(t) || /^(hiring|employer|i am hiring|i'm hiring|hire)$/.test(t)) return "employer";
  if (/^3\b/.test(t) || /^(other|something else|else)$/.test(t)) return "other";
  return null;
}
