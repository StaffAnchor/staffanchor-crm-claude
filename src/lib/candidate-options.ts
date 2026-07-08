// Mirrors the option sets used on the public apply form (jobs-staffanchor repo)
// so the recruiter's "Create candidate" form offers the same known values
// instead of free text that then doesn't match anything.

export const cityStateMap: Record<string, string> = {
  Delhi: "Delhi",
  Noida: "Uttar Pradesh",
  "Greater Noida": "Uttar Pradesh",
  Gurgaon: "Haryana",
  Faridabad: "Haryana",
  Ghaziabad: "Uttar Pradesh",
  Mumbai: "Maharashtra",
  Pune: "Maharashtra",
  Nagpur: "Maharashtra",
  Bangalore: "Karnataka",
  Hyderabad: "Telangana",
  Chennai: "Tamil Nadu",
  Coimbatore: "Tamil Nadu",
  Kolkata: "West Bengal",
  Ahmedabad: "Gujarat",
  Surat: "Gujarat",
  Vadodara: "Gujarat",
  Chandigarh: "Chandigarh",
  Mohali: "Punjab",
  Jaipur: "Rajasthan",
  Lucknow: "Uttar Pradesh",
  Kanpur: "Uttar Pradesh",
  Indore: "Madhya Pradesh",
  Bhopal: "Madhya Pradesh",
  Kochi: "Kerala",
  Thiruvananthapuram: "Kerala",
  Visakhapatnam: "Andhra Pradesh",
  Patna: "Bihar",
  Guwahati: "Assam",
  Bhubaneswar: "Odisha",
  Dehradun: "Uttarakhand",
};

export const cityOptions = [...Object.keys(cityStateMap), "Other"];

export const b2bSubDomains = [
  "SaaS Sales",
  "Enterprise Sales (Non-SaaS)",
  "Government / Institutional Sales",
  "Inside Sales (B2B)",
  "Channel / Partner / Distribution Sales",
  "Healthcare / Pharma Sales",
];

export const b2cSubDomains = [
  "Inside Sales (B2C)",
  "EdTech",
  "BFSI (Fintech / Finance / Loan / Insurance)",
  "Retail Sales",
  "Real Estate",
  "Other Consumer Sales",
];

export const nonSalesSubDomains = [
  "Marketing",
  "Operations",
  "Human Resources (HR)",
  "Finance & Accounts",
  "Customer Success",
  "Information Technology (IT)",
  "Product Management",
  "Business Development / Strategy",
  "Supply Chain & Procurement",
  "Legal & Compliance",
  "Administration",
  "Design (UI/UX/Graphic)",
  "Data & Analytics",
  "Other",
];

export function subDomainsForCategory(category: string | null): string[] {
  if (category === "b2b_sales") return b2bSubDomains;
  if (category === "b2c_sales") return b2cSubDomains;
  if (category === "non_sales") return nonSalesSubDomains;
  return [];
}

// Whole-lakh CTC dropdown, 0-120 LPA plus a 120+ ceiling (stored as 121 to
// distinguish "exactly 120" from "more than 120" -- same convention the
// public apply form uses).
export const ctcOptions: { value: number; label: string }[] = [
  ...Array.from({ length: 121 }, (_, i) => ({ value: i, label: i === 0 ? "0 LPA" : `${i} LPA` })),
  { value: 121, label: "120L+" },
];
