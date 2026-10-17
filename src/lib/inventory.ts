// The Talent Inventory: what the database holds, by kind of role and by city, whatever mandates are open.
// The numbers come from candidate_role_tags (rebuilt daily from CV job titles by simple, editable rules).

export const METROS = ["Bengaluru", "Delhi NCR", "Mumbai (MMR)", "Hyderabad", "Pune", "Chennai", "Kolkata", "Ahmedabad", "Other India", "Abroad", "Unknown"] as const;

export const TRACKS = [
  { value: "b2b_sales", label: "B2B Sales" },
  { value: "b2c_sales", label: "B2C Sales" },
  { value: "non_sales", label: "Non-Sales" },
] as const;

export const DOMAINS: Record<string, { value: string | null; label: string }[]> = {
  b2b_sales: [
    { value: null, label: "All B2B" },
    { value: "SaaS & tech", label: "SaaS & tech" },
    { value: "Other B2B", label: "Other B2B (industrial, services, ...)" },
  ],
  b2c_sales: [{ value: null, label: "All B2C" }],
  non_sales: [{ value: null, label: "All functions" }],
};

export const LEVELS: { key: string; label: string; senior: string[] | null }[] = [
  { key: "all", label: "All levels", senior: null },
  { key: "leaders", label: "Leaders (team lead and above)", senior: ["team_lead", "manager", "director", "vp_plus"] },
  { key: "heads", label: "Heads (director and above)", senior: ["director", "vp_plus"] },
  { key: "ic", label: "Individual contributors", senior: ["ic"] },
];

export const SENIORITY_SHORT: Record<string, string> = { ic: "IC", team_lead: "Team lead", manager: "Manager", director: "Director", vp_plus: "VP and above" };

export type InventoryParams = {
  track: string;
  domain: string | null;
  scope: "current" | "any";
  level: string;
  cluster: string | null;
  metro: string | null;
};

export function parseParams(sp: Record<string, string | string[] | undefined>): InventoryParams {
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);
  const track = TRACKS.some((t) => t.value === one("track")) ? (one("track") as string) : "b2b_sales";
  const domainOk = (DOMAINS[track] ?? []).some((d) => d.value === one("domain"));
  return {
    track,
    domain: domainOk ? one("domain") : null,
    scope: one("scope") === "any" ? "any" : "current",
    level: LEVELS.some((l) => l.key === one("level")) ? (one("level") as string) : "all",
    cluster: one("cluster"),
    metro: one("metro"),
  };
}

export function inventoryHref(p: InventoryParams, over: Partial<InventoryParams>): string {
  const n = { ...p, ...over };
  const q = new URLSearchParams();
  if (n.track !== "b2b_sales") q.set("track", n.track);
  if (n.domain) q.set("domain", n.domain);
  if (n.scope === "any") q.set("scope", "any");
  if (n.level !== "all") q.set("level", n.level);
  if (n.cluster) q.set("cluster", n.cluster);
  if (n.metro) q.set("metro", n.metro);
  const s = q.toString();
  return `/candidates/inventory${s ? `?${s}` : ""}`;
}
