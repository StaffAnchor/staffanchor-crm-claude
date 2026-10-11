// How usable a profile is in a mandate right now. The score and the list of what is missing are
// worked out in the database (readiness_for); this file is only labels and colours.

export type ReadinessTier = "ready" | "almost" | "needs_work";

export const TIER_LABEL: Record<ReadinessTier, string> = {
  ready: "Ready to shortlist",
  almost: "Almost there",
  needs_work: "Needs work",
};

export const TIER_BLURB: Record<ReadinessTier, string> = {
  ready: "Reachable, placeable and read",
  almost: "One or two details short",
  needs_work: "Key details missing",
};

export const TIER_BAR: Record<ReadinessTier, string> = {
  ready: "bg-emerald-500",
  almost: "bg-amber-400",
  needs_work: "bg-rose-400",
};

export const TIER_PILL: Record<ReadinessTier, string> = {
  ready: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800",
  almost: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800",
  needs_work: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800",
};

export const MISSING_LABEL: Record<string, string> = {
  current_ctc: "Current CTC",
  expected_ctc: "Expected CTC",
  notice: "Notice period",
  cv_read: "CV not read yet",
  cv: "No CV file",
  phone: "Mobile number",
  email: "Email",
  name: "Proper name",
  title: "Job title",
  employer: "Current employer",
  city: "City",
  experience: "Experience",
  industries: "Industries",
};

export type ReadinessOverview = {
  total: number;
  avg: number;
  tiers: Partial<Record<ReadinessTier, number>>;
  missing: Record<string, number>;
  sales_ready: number;
  sales_total: number;
};
