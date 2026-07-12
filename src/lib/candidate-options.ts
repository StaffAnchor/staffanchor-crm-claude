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
  "Digital / Performance Marketing",
  "Content / Communications / PR",
  "Operations",
  "Human Resources (HR) / Talent Acquisition",
  "Finance & Accounts",
  "Customer Success",
  "Customer Support / Service",
  "Software Engineering / Development",
  "Quality Assurance (QA) / Testing",
  "DevOps / Site Reliability (SRE)",
  "Data Science / Machine Learning",
  "Data & Analytics / Business Intelligence",
  "IT Support / Infrastructure / Systems Admin",
  "Cybersecurity / InfoSec",
  "Cloud / Solutions Architecture",
  "Product Management",
  "Product Design (UI/UX)",
  "Business Development / Strategy",
  "Supply Chain & Procurement / Logistics",
  "Legal & Compliance",
  "Administration / Facilities",
  "Manufacturing / Production / Quality Control",
  "Research & Development (R&D)",
  "Healthcare / Clinical / Paramedical",
  "Education / Training / Academics",
  "Consulting / Advisory",
  "Investment / Wealth Management",
  "Actuarial / Risk Management",
  "Media / Entertainment / Content Creation",
  "Hospitality / Travel / Tourism",
  "Construction / Engineering (Civil / Mechanical / Electrical)",
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

export const experienceOptions: { value: number; label: string }[] = [
  { value: 0, label: "Fresher" },
  ...Array.from({ length: 40 }, (_, i) => {
    const years = i + 1;
    return { value: years, label: years === 1 ? "1 year" : `${years} years` };
  }),
  { value: 41, label: "40+ years" },
];

export const noticePeriodOptions = ["Immediate", "15 days", "30 days", "60 days", "90 days"];

export const employmentStatusOptions = [
  "Employed",
  "Serving Notice",
  "Self-Employed",
  "Entrepreneur / Founder",
  "Freelancing / Consulting",
  "Career Break / Sabbatical",
  "Between Jobs",
  "First Job Seeker",
];

export const roleTypeOptions = ["Individual Contributor (IC)", "Leading a Team"] as const;

export const teamSizeOptions = [
  "1-5", "6-10", "11-20", "21-30", "31-40", "41-50",
  "51-75", "76-100", "101-150", "151-200", "201-300",
  "301-400", "401-500", "501-750", "751-1000", "1000+",
];

// Extensive industry taxonomy, matching the list used on the candidate-facing
// forms (jobs.staffanchor.com Apply/profile-edit) for Current Industry /
// Previous Industries, so recruiter-side filters line up with what
// candidates actually select.
export const industryOptions = [
  "SaaS / Cloud Software",
  "IT Infrastructure & Hardware",
  "Cybersecurity",
  "ERP / CRM / HRMS Software",
  "AI / ML Products",
  "Data & Analytics Platforms",
  "IT Services & Consulting",
  "System Integration",
  "Telecom & Networking",
  "Semiconductors / Electronics",
  "IT Security",
  "Life Insurance",
  "Health / General Insurance",
  "Mutual Funds / Wealth Management",
  "Banking (Retail)",
  "Banking (Corporate / SME)",
  "NBFC / Microfinance",
  "Fintech / Digital Payments",
  "Stock Broking / Capital Markets",
  "Credit Cards / Lending",
  "Real Estate Finance",
  "Pharma (Ethical / Rx)",
  "Pharma (OTC / Consumer)",
  "Medical Devices & Diagnostics",
  "Hospital & Healthcare Services",
  "Biotech",
  "Nutraceuticals & HealthTech",
  "Dental / Optical",
  "FMCG",
  "Consumer Durables",
  "D2C Brands",
  "Fashion & Apparel",
  "Luxury & Premium Goods",
  "Modern Trade / Retail Chains",
  "QSR / Food & Beverage",
  "Beauty & Personal Care",
  "Jewellery",
  "Industrial Equipment & Machinery",
  "Automotive & Auto Components",
  "Chemicals & Specialty Chemicals",
  "Steel / Metals / Mining",
  "Packaging",
  "Textiles",
  "Renewable Energy / Solar",
  "Oil & Gas / Energy",
  "Agrochemicals / Seeds",
  "Construction Materials",
  "Residential Real Estate",
  "Commercial Real Estate",
  "Co-working / Managed Spaces",
  "Infrastructure / EPC Projects",
  "Smart City Projects",
  "EdTech / Training & Skilling",
  "Logistics & Supply Chain",
  "Staffing / HR Tech",
  "Media / Advertising / MarTech",
  "Travel & Hospitality",
  "Events & Experiential",
  "Legal Tech / Professional Services",
  "Government / Public Sector",
  "Defence",
  "Non-profit / Social Enterprise",
];

// ---- Everything below mirrors the additional option sets used on the public
// candidate-facing "Build Your Profile" wizard (jobs-staffanchor repo), added
// so the recruiter-side "Edit profile" modal can offer full field parity
// instead of only a subset of fields. ----

export const roleLevelOptions = [
  "IC – Sales Development",
  "IC – Account Executive",
  "IC",
  "Manager",
  "Senior Manager",
  "Director",
  "VP / Head",
];

export const currencyOptions = ["INR", "USD"] as const;
export type CurrencyValue = (typeof currencyOptions)[number];

export const dealSizeBandsB2B: Record<CurrencyValue, string[]> = {
  INR: [
    "<5L", "5L-10L", "10L-15L", "15L-20L", "20L-30L", "30L-50L", "50L-1Cr",
    "1Cr-5Cr", "5Cr-10Cr", "10Cr-20Cr", "20Cr-40Cr", "40Cr-75Cr", "75Cr+",
  ],
  USD: [
    "<$10K", "$10K-$25K", "$25K-$50K", "$50K-$100K", "$100K-$250K", "$250K-$500K",
    "$500K-$1M", "$1M-$5M", "$5M-$10M", "$10M+",
  ],
};

export const dealSizeBandsB2C: Record<CurrencyValue, string[]> = {
  INR: ["<10K", "10K-25K", "25K-50K", "50K-1L", "1L-2L", "2L-5L", "5L-10L", "10L-25L", "25L+"],
  USD: ["<$500", "$500-$1K", "$1K-$5K", "$5K-$10K", "$10K-$25K", "$25K-$50K", "$50K+"],
};

export function dealSizeBandsFor(category: string | null, currency: CurrencyValue | ""): string[] {
  if (!currency) return [];
  if (category === "b2c_sales") return dealSizeBandsB2C[currency];
  return dealSizeBandsB2B[currency];
}

export const insideSalesSubDomains = ["Inside Sales (B2B)", "Inside Sales (B2C)"];

export const ahtOptions = ["<3 mins", "3-5 mins", "5-8 mins", "8-12 mins", "12-20 mins", "20+ mins"];
export const dailyCallTargetOptions = ["<20", "20-40", "40-60", "60-80", "80-100", "100-150", "150+"];
export const dailyTalkTimeOptions = ["<1 hour", "1-2 hours", "2-3 hours", "3-4 hours", "4-5 hours", "5+ hours"];
export const leadSourceOptions = [
  "Inbound", "Outbound", "Social Media Campaigns", "Contact Us / Website Forms",
  "Influencer Leads", "Referrals", "Paid Ads", "Events / Field", "Partner / Channel",
];

export const salesCycleOptions = [
  "Same day", "<1 week", "1-4 weeks", "1-3 months", "3-6 months", "6-12 months", "12+ months",
];
export const sellingStyleOptions = ["Hunter", "Farmer", "Hybrid"];
export const salesMotionOptions = [
  "Outbound-Hunting", "Inbound", "Account-based", "Channel-led", "Field / On-ground",
];
export const customerSegmentOptions = ["SMB", "Mid-Market", "Enterprise", "MNC", "Startup", "Government"];
export const funnelStageOptions = ["Acquisition", "Full-funnel", "Retention / Upsell"];
export const geographicScopeOptions = [
  "Single City", "Multi-City", "Regional (Multiple States)", "Pan-India", "International / Global",
];
export const internationalRegionOptions = [
  "North America (US/Canada)", "Europe", "MENA", "Gulf (GCC)", "APAC / Asia",
  "South Asia", "LATAM", "Global / Worldwide",
];

export const workModeOptions = ["Onsite", "Hybrid", "Remote", "Open to Any (as per company requirement)"];
export const relocationOptions = ["Yes", "No", "Maybe"];
export const travelPreferenceOptions = ["No Travel", "Some Travel (occasional)", "Extensive Travel"];

export const highestQualificationOptions = [
  "High School", "Diploma", "Bachelor's Degree (B.A. / B.Com / B.Sc.)", "B.Tech / B.E. (Engineering)",
  "Master's Degree (M.A. / M.Com / M.Sc.)", "M.Tech / M.E. (Engineering)", "MBA / PGDM",
  "CA (Chartered Accountant)", "CS (Company Secretary)", "CMA / ICWA (Cost Accountant)",
  "CFA (Chartered Financial Analyst)", "LLB / Law Degree", "MBBS / Medical Degree",
  "Doctorate (PhD)", "Other",
];

export const achievementBandOptions = [
  "Less than 50%", "50-75%", "75-80%", "81-85%", "86-90%", "91-95%", "96-100%",
  "100-110%", "110-120%", "More than 120%",
];

// ---- Gold Standard Mandate Intake option sets (recruiter-only briefing
// fields -- these are never selected by the public jobs.staffanchor.com
// listing query, which is what keeps them internal without needing a
// separate per-field visibility flag). Deliberately no gender/demographic
// preference field: that's a discrimination/compliance risk in hiring
// software and was intentionally left out rather than silently added. ----

export const hiringReasonOptions = [
  { value: "new_role", label: "New Role (net new headcount)" },
  { value: "replacement", label: "Replacement" },
];

export const teamHandlingOptions = [
  { value: "individual_contributor", label: "Individual Contributor" },
  { value: "team_lead", label: "Leads a Team" },
];

export const workingDaysOptions = ["5 days", "5.5 days", "6 days", "Rotational"];

export const shiftTimingOptions = [
  "Day shift", "Night shift (US)", "UK shift", "Rotational shift", "Flexible",
];

// Which day(s) of the week are off -- kept as a flexible multi-select of
// individual weekdays rather than a fixed "2 days off"/"1 day off" preset,
// since the actual day(s) vary by client regardless of how many days off
// (e.g. 6-days-a-week roles are usually a single day off, but not always
// Monday; 5-days roles are usually Sat+Sun, but some clients run Tue-off
// instead). Recruiters just tick whichever day(s) actually apply.
export const weekDaysOptions = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

// B2C: who the end consumer actually is. Distinct from `customerSegmentOptions`
// above (SMB/Enterprise/etc., which is a B2B company-size framing) -- B2C
// roles sell to individual consumers, not other businesses, so "industry"
// doesn't apply the same way.
export const b2cCustomerTypeOptions = [
  "Middle Class", "Upper Middle Class", "High Net-worth Individuals (HNI)",
  "Parents", "Students", "Working Professionals", "Young Professionals / First Jobbers",
  "Homemakers", "Senior Citizens", "Retail Walk-in Visitors", "Small Business Owners",
  "Urban Consumers", "Rural / Semi-Urban Consumers",
];

// B2B: the actual decision-maker persona/title this role sells to -- distinct
// from `industryOptions`/industries-sold-to, which describe the client
// company's sector, not who within it the seller actually talks to.
export const clientProfileOptions = [
  "CEO / Founder", "CFO", "COO", "CHRO / HR Head", "HR Manager", "CTO / Tech Head",
  "IT Head", "Plant Head / Operations Head", "Procurement Head", "Marketing Head",
  "Sales Head", "VP / Director level", "Business Owner (SMB)",
];
