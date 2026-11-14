// Which set of "about their work" questions a call should ask. It follows the ROLE when the call is made from a role's pipeline
// (a service role is asked service questions even if the person's profile says sales), and the person's own profile type
// otherwise. Everything in the common details (pay, notice, relocation, city, experience) is asked for every kind.
export type ProfileKind = "sales" | "service" | "other";

const SERVICE = new Set(["customer_success", "cust_support"]);
const OTHER = new Set([
  "ca", "audit_tax", "fpa_controller", "finance_accounts", "talent_acq", "hr_ops", "hr_generalist", "marketing_performance", "product_marketing",
  "marketing_brand", "ops_supply_chain", "product_mgmt", "data_analytics", "engineering", "design_ux", "legal_compliance", "strategy_gm", "healthcare_pharma", "other_role",
]);

export function profileKind(roleCluster?: string | null, profileGroup?: string | null): ProfileKind {
  if (roleCluster) {
    if (SERVICE.has(roleCluster)) return "service";
    if (OTHER.has(roleCluster)) return "other";
    return "sales";
  }
  if (profileGroup === "non_sales") return "other";
  return "sales";
}

export const KIND_TITLE: Record<ProfileKind, string> = {
  sales: "Sales: how they sell",
  service: "Service: how they work",
  other: "Their kind of work",
};
