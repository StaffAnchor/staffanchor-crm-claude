// Five quick tags a recruiter can set after a call. Stored one row per call in
// candidate_call_ratings so a candidate's record builds over time.
export const RATING_DIMENSIONS = [
  { key: "communication", label: "Communication" },
  { key: "seriousness", label: "Seriousness" },
  { key: "stability", label: "Stability" },
  { key: "salary_realism", label: "Salary realism" },
  { key: "skill_match", label: "Skill match" },
] as const;

export type RatingKey = (typeof RATING_DIMENSIONS)[number]["key"];
export type RatingValue = "good" | "okay" | "weak";
export type CallRating = Partial<Record<RatingKey, RatingValue | null>>;

export const RATING_LABEL: Record<RatingValue, string> = { good: "Good", okay: "Okay", weak: "Weak" };
