// The few things that best describe what a person does, for the strip on a candidate card: the kind of selling (B2B or B2C),
// their field, how they sell, and the tools they use. Read from the structured CV facts and the profile, never invented, and
// short enough to scan. When a role is known, the ones that match it come first and are marked.

export type Skill = { text: string; match: boolean };

type Facts = {
  sales?: { primary_motion?: string | null; customer_type?: string | null; segments?: string[]; owned_full_cycle?: string | null; hunter_or_farmer?: string | null; leads_team?: boolean | null; largest_team_size?: number | null } | null;
  industries?: string[] | null;
  tools?: string[] | null;
};

const GROUP: Record<string, string> = { b2b_sales: "B2B Sales", b2c_sales: "B2C Sales" };
const CUSTOMER: Record<string, string> = { b2b: "B2B Sales", b2c: "B2C Sales", b2b2c: "B2B2C Sales", mixed: "B2B + B2C Sales" };
const HUNTER: Record<string, string> = { hunter: "Hunter", farmer: "Farmer", both: "Hunter + farmer" };

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t && t.toLowerCase() !== "null" && t.length <= 34 ? t : null;
};
const title = (s: string) => (s === s.toLowerCase() ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : s);
const words = (s: string) => s.toLowerCase().match(/[a-z0-9+#]{3,}/g) ?? [];

export function skillsFromFacts(facts: Facts | null | undefined, profile: { profile_group?: string | null; sub_domain?: string | null }, roleText?: string | null, max = 7): Skill[] {
  const out: string[] = [];
  const add = (v: unknown) => {
    const t = clean(v);
    if (t && !out.some((o) => o.toLowerCase() === t.toLowerCase())) out.push(title(t));
  };
  const s = facts?.sales ?? null;
  add((profile.profile_group && GROUP[profile.profile_group]) || (s?.customer_type && CUSTOMER[s.customer_type]) || null);
  add(profile.sub_domain);
  add(s?.primary_motion);
  add(s?.hunter_or_farmer && HUNTER[s.hunter_or_farmer]);
  if (s?.owned_full_cycle === "yes") add("Full-cycle sales");
  if (s?.leads_team) add(s.largest_team_size ? `Leads a team of ${s.largest_team_size}` : "Leads a team");
  for (const x of (s?.segments ?? []).slice(0, 2)) add(x);
  for (const x of (facts?.industries ?? []).slice(0, 2)) add(x);
  for (const x of (facts?.tools ?? []).slice(0, 3)) add(x);

  const role = new Set(words(roleText ?? ""));
  const skills = out.map((text) => ({ text, match: role.size > 0 && words(text).some((w) => role.has(w)) }));
  // Matches first, then the original order (selling type and field lead).
  return [...skills.filter((x) => x.match), ...skills.filter((x) => !x.match)].slice(0, max);
}
