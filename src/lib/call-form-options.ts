// The quick-tap answers the call form records beyond the vitals. Shared by the form and the save route, so what is shown is
// exactly what is accepted. Values that already exist in the registration data (style, quota bands, sales cycle,
// expected_ctc_negotiable) keep their spelling so calls and the registration form fill the same fields.

export const REASONS = ["Growth / bigger role", "Better pay", "Manager or culture", "Company instability", "Unrealistic targets", "Relocating", "Role or domain change", "Just exploring"] as const;
export const INTERVIEWING = [
  { v: "none", label: "Not yet" },
  { v: "1-2", label: "1–2 companies" },
  { v: "3+", label: "3 or more" },
] as const;
export const NOTICE_FLEX = [
  { v: "buyout", label: "Can join earlier / buyout" },
  { v: "negotiable", label: "Negotiable" },
  { v: "fixed", label: "Fixed" },
] as const;
export const QUOTA_BANDS = ["Less than 50%", "50-60%", "60-70%", "70-80%", "80-90%", "90-95%", "95-100%", "100-110%", "110% or above"] as const;
export const STYLES = ["Hunter", "Farmer", "Hybrid"] as const;
export const CYCLES = ["Same day", "<1 week", "1-4 weeks", "1-3 months", "3-6 months", "6-12 months", "12+ months"] as const;
export const BEST_TIMES = ["Morning", "Afternoon", "Evening", "Weekend"] as const;

/** The five judgments a recruiter makes on a call, each good, okay or weak. */
export const JUDGMENTS = [
  { key: "communication", label: "Communication", hint: "Clear, confident, to the point" },
  { key: "seriousness", label: "Seriousness", hint: "Really wants to move" },
  { key: "stability", label: "Stability", hint: "Stays in jobs" },
  { key: "salary_realism", label: "Pay realism", hint: "Expectation fits their worth" },
  { key: "skill_match", label: "Skill fit", hint: "Can do what they say" },
] as const;
export type JudgmentKey = (typeof JUDGMENTS)[number]["key"];

export type CallSegment = {
  reason_for_change?: string[];
  interviewing_elsewhere?: string;
  notice_flex?: string;
  expected_ctc_negotiable?: boolean;
  carries_quota?: boolean;
  quota_last_year?: string;
  style?: string;
  cycle?: string;
  best_time_to_call?: string;
  can_refer?: boolean;
};
