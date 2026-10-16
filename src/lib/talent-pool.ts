// The Talent Pool: candidates a recruiter has judged good enough to hold on to and call first when a
// matching role opens. A pool entry records the tier, why, who decided and when, so it stays useful after
// the conversation is forgotten. One entry per candidate per practice.

export const POOL_PRACTICE = "saas";

export const POOL_TIERS = ["top", "strong", "watch"] as const;
export type PoolTier = (typeof POOL_TIERS)[number];

export const POOL_TIER_LABEL: Record<PoolTier, string> = { top: "Top talent", strong: "Strong", watch: "Watch" };
export const POOL_TIER_HELP: Record<PoolTier, string> = {
  top: "Would put in front of any client. Call first.",
  strong: "Solid and placeable. Good for the right role.",
  watch: "Promising, or not ready yet. Keep warm.",
};
export const POOL_TIER_PILL: Record<PoolTier, string> = {
  top: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:ring-amber-700",
  strong: "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800",
  watch: "bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700",
};

/** One-tap evidence a recruiter can attach, so the reason is searchable and consistent. */
export const POOL_TAGS = [
  "Beat quota consistently",
  "Enterprise logos",
  "Mid-market SaaS",
  "Strong hunter",
  "Large deals",
  "Great communicator",
  "Stable career",
  "Leadership potential",
  "Early-stage / founder-led",
  "Referred by someone we trust",
] as const;

export type PoolEntry = {
  tier: PoolTier;
  reason: string | null;
  tags: string[];
  marked_by_name?: string | null;
  marked_at?: string;
};

export const isPoolTier = (v: unknown): v is PoolTier => typeof v === "string" && (POOL_TIERS as readonly string[]).includes(v);

/** Top and Strong need a reason, so the pool is something the team can trust. */
export const reasonRequired = (tier: PoolTier) => tier === "top" || tier === "strong";
