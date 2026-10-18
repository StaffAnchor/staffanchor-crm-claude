// How a profile is named everywhere: "B2B Sales › SaaS and Software". The group and sub-group come from a fixed list set in
// the database, never free text, and a recruiter can correct one (which then stays put).

export const GROUP_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales",
  unclear: "Needs a look",
};

export const profileLabel = (group: string | null | undefined, subGroup: string | null | undefined): string | null => {
  const g = group ? GROUP_LABEL[group] ?? null : null;
  if (!g) return null;
  return subGroup && group !== "unclear" ? `${g} › ${subGroup}` : g;
};

export const SUB_GROUPS: Record<string, string[]> = {
  b2b_sales: ["SaaS and Software", "Enterprise Tech and IT Services", "Industrial and Manufacturing", "BFSI and Fintech", "EdTech (institutions)", "Channel and Partnerships", "Inside Sales (B2B)", "Other B2B"],
  b2c_sales: ["Inside Sales (B2C)", "Retail Sales", "EdTech (counselling)", "Insurance and Loans", "Real Estate and Auto", "FMCG and Consumer", "Telecom", "Other B2C"],
  non_sales: ["Finance (CA)", "Finance and Accounts", "HR and Talent", "Marketing", "Operations and Supply Chain", "Customer Support", "Product and Tech", "Design (Interior, UX)", "Legal", "Other non-sales"],
};
