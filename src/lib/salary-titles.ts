// What a role type is called on a public salary page. Kept in step with the same list on the jobs site.
export const SALARY_TITLE: Record<string, string> = {
  sales_manager: "Sales Manager",
  sales_leadership: "Sales Head / Director",
  bd_exec: "Business Development Executive",
  sdr_bdr: "SDR / BDR",
  account_exec: "Account Executive",
  inside_sales: "Inside Sales Executive",
  field_sales: "Field Sales Executive",
  solution_eng: "Solution Engineer / Pre-sales",
  customer_success: "Customer Success Manager",
  account_mgmt: "Key Account Manager",
  channel_partner: "Channel Partnerships Manager",
  sales_ops: "Sales Operations / RevOps",
  retail_sales: "Retail Sales Executive",
  bfsi_rm: "Relationship Manager (BFSI)",
  edtech_counsellor: "EdTech Counsellor",
};
export const salaryTitle = (slug: string, fallback: string) => SALARY_TITLE[slug] ?? fallback.replace(/\s*\(.*\)\s*$/, "");
