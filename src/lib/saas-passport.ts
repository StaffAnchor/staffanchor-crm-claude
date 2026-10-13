// B2B SaaS / tech sales "passport": the sales facts a hiring manager asks first.
// Worked out in the database (view saas_passport) from the CV facts and from
// what the candidate or a recruiter confirmed on the profile; this file is
// only the row shape and labels.

export type PassportRow = {
  candidate_id: string;
  full_name: string | null;
  current_employer: string | null;
  current_job_title: string | null;
  city: string | null;
  total_experience_years: number | string | null;
  current_fixed_ctc: number | string | null;
  expected_fixed_ctc: number | string | null;
  notice_period: string | null;
  notice_days_est: number | null;
  readiness_score: number | null;
  readiness_tier: "ready" | "almost" | "needs_work" | null;
  sub_domain: string | null;
  status: string | null;
  practice_fit: "saas" | "tech" | null;
  segments: string[] | null;
  role_motion: string | null;
  hunter_farmer: string | null;
  deal_size: string | null;
  sales_cycle: string | null;
  quota: string | null;
  team_size: string | null;
  best_achievement: string | null;
  tools: string[] | null;
  confirmed_by_profile: boolean | null;
  passport_score: number;
  passport_missing: string[] | null;
  cv_read: boolean;
  phone: string | null;
  email: string | null;
  has_cv: boolean;
  readiness_missing: string[] | null;
};

export const PASSPORT_COLUMNS =
  "candidate_id, full_name, current_employer, current_job_title, city, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, notice_days_est, readiness_score, readiness_tier, sub_domain, status, practice_fit, segments, role_motion, hunter_farmer, deal_size, sales_cycle, quota, team_size, best_achievement, tools, confirmed_by_profile, passport_score, passport_missing, cv_read, phone, email, has_cv, readiness_missing";

export const FIT_LABEL: Record<string, string> = { saas: "SaaS", tech: "Tech" };

export const SEGMENT_LABEL: Record<string, string> = {
  smb: "SMB",
  "mid-market": "Mid-market",
  enterprise: "Enterprise",
  startup: "Startup",
  government: "Government",
};

export function segmentLabel(s: string): string {
  return SEGMENT_LABEL[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
}

export const HUNTER_LABEL: Record<string, string> = { hunter: "Hunter", farmer: "Farmer", both: "Hunter and farmer" };

export function passportTone(score: number): "success" | "warning" | "danger" {
  return score >= 70 ? "success" : score >= 40 ? "warning" : "danger";
}

// Passport gap label (as the view writes it) to the key the message templates know.
const PASSPORT_GAP_KEY: Record<string, string> = {
  segment: "customer_segments",
  "deal size": "deal_size",
  "quota / attainment": "quota",
  "sales cycle": "sales_cycle",
  "hunter or farmer": "hunter_farmer",
};

const READINESS_GAP_LABEL: Record<string, string> = {
  current_ctc: "current CTC",
  expected_ctc: "expected CTC",
  notice: "notice period",
  cv_read: "CV not read",
  cv: "no CV file",
  phone: "mobile number",
  email: "email",
  name: "proper name",
  title: "job title",
  employer: "employer",
  city: "city",
  experience: "experience",
  industries: "industries",
};

/** Everything still worth asking this person, in plain words, passport gaps first. */
export function gapLabels(r: Pick<PassportRow, "passport_missing" | "readiness_missing">): string[] {
  const fromPassport = (r.passport_missing ?? []).filter((g) => g !== "role type");
  const fromReadiness = (r.readiness_missing ?? []).map((k) => READINESS_GAP_LABEL[k] ?? k);
  return Array.from(new Set([...fromPassport, ...fromReadiness]));
}

/** The same gaps as template keys, for the ask-for-details WhatsApp message. */
export function gapKeys(r: Pick<PassportRow, "passport_missing" | "readiness_missing">): string[] {
  const fromPassport = (r.passport_missing ?? []).map((g) => PASSPORT_GAP_KEY[g]).filter((k): k is string => !!k);
  const fromReadiness = (r.readiness_missing ?? []).filter((k) => !["cv_read", "name"].includes(k));
  return Array.from(new Set([...fromReadiness, ...fromPassport]));
}

/** Not yet usable for a mandate without a follow-up call. */
export function isIncomplete(r: PassportRow): boolean {
  return r.readiness_tier !== "ready" || r.passport_score < 70;
}
