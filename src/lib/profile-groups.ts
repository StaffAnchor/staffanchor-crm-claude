// How a profile is grouped on the Candidates page. The groups themselves are worked out in the
// database (derive_profile_group) from what a candidate's CV shows; this file is only labels and colours.

export type ProfileGroup = "b2b_sales" | "b2c_sales" | "non_sales" | "unclear";

export const GROUP_LABEL: Record<ProfileGroup, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
  unclear: "Not enough data",
};

export const GROUP_BLURB: Record<ProfileGroup, string> = {
  b2b_sales: "Sell to businesses",
  b2c_sales: "Sell to consumers",
  non_sales: "Everyone else, by function",
  unclear: "Waiting for a CV",
};

export const GROUP_BADGE: Record<ProfileGroup, string> = {
  b2b_sales: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800",
  b2c_sales: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-800",
  non_sales: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800",
  unclear: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

export const GROUP_BAR: Record<ProfileGroup, string> = {
  b2b_sales: "bg-indigo-500",
  b2c_sales: "bg-emerald-500",
  non_sales: "bg-amber-500",
  unclear: "bg-slate-300 dark:bg-slate-600",
};

export const SUBGROUPS = [
  "Marketing & Brand",
  "Operations & Supply Chain",
  "Customer Support & Success",
  "HR & Talent",
  "Finance & Accounts",
  "Product & Technology",
  "Design & Architecture",
  "Media & Content",
  "Legal & Compliance",
  "Healthcare & Pharma",
  "Strategy & General Management",
] as const;

export const OTHER_SUBGROUP = "Other / unspecified";

export type GroupOverview = {
  total: number;
  groups: Partial<Record<ProfileGroup, { n: number; new7: number; high: number; with_cv: number }>>;
  subgroups: Record<string, number>;
  needs_review: number;
  waiting_for_cv: number;
  industries: Partial<Record<ProfileGroup, { name: string; n: number }[]>>;
};
