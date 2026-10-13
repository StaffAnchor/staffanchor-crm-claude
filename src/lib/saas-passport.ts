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
};

export const PASSPORT_COLUMNS =
  "candidate_id, full_name, current_employer, current_job_title, city, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, notice_days_est, readiness_score, readiness_tier, sub_domain, status, practice_fit, segments, role_motion, hunter_farmer, deal_size, sales_cycle, quota, team_size, best_achievement, tools, confirmed_by_profile, passport_score, passport_missing, cv_read";

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
