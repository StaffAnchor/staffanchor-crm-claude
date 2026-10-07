// A recruiter's overall verdict on a candidate's CV, separate from any one
// role. "Weak" and "strong" follow the person everywhere; the reason a
// candidate was rejected for one role does not.

export type ProfileRating = "strong" | "weak";

export type ProfileRatingRow = {
  candidate_id: string;
  rating: ProfileRating;
  reasons: string[];
  note: string | null;
  rated_by_name: string | null;
};

export const WEAK_REASONS: { value: string; label: string }[] = [
  { value: "pay_too_low", label: "Pay too low for the bar" },
  { value: "too_experienced", label: "Too much experience for these roles" },
  { value: "job_hopping", label: "Job-hopping" },
  { value: "unverifiable_cv", label: "CV can't be verified" },
  { value: "poor_communication", label: "Poor communication" },
  { value: "not_sales", label: "Not a sales profile" },
];

export const STRONG_REASONS: { value: string; label: string }[] = [
  { value: "strong_record", label: "Strong sales record" },
  { value: "stable_career", label: "Stable career" },
  { value: "great_communicator", label: "Great communicator" },
  { value: "keep_for_similar", label: "Keep for similar roles" },
];

export const reasonLabel = (value: string) => [...WEAK_REASONS, ...STRONG_REASONS].find((r) => r.value === value)?.label ?? value.replace(/_/g, " ");

export const RATING_LABEL: Record<ProfileRating, string> = { strong: "Strong profile", weak: "Weak profile" };

// How a rating moves a match score. Weak candidates sink on every role;
// strong ones get a lift only on roles in their own area, so a great
// inside-sales profile doesn't float up for a finance job.
export const WEAK_PENALTY = 15;
export const STRONG_BOOST_SAME_AREA = 6;
