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

// ---- Unified Candidate Intake taxonomy (Profile Type -> Practice/Vertical/
// Function -> Sub-domain). Additive, not a replacement for the lists above --
// `subDomainsForCategory` still backs the mandate-creation form and existing
// candidate records at that granularity. This new layer is what the unified
// ApplyForm/Quick Apply/Recruiter Created component uses going forward.
// `category` itself is unchanged (`b2b_sales` / `b2c_sales` / `non_sales` --
// already matches Profile Type 1:1, confirmed against the DB CHECK
// constraint, so no migration was needed for this level). ----

export const profileTypeOptions: { value: string; label: string }[] = [
  { value: "b2b_sales", label: "B2B Sales" },
  { value: "b2c_sales", label: "B2C Sales" },
  { value: "non_sales", label: "Other (Non-Sales)" },
];

// Level 1 under B2B Sales -- the three frozen business practices.
export const b2bPractices = [
  "Enterprise Tech Sales & Revenue",
  "Industrial & Infrastructure",
  "Other B2B",
] as const;

// Level 2 (sub-domain) per B2B practice.
export const enterpriseTechSubDomains = [
  "SaaS", "Cybersecurity", "Cloud Infrastructure", "AI Platforms", "FinTech", "Data & Analytics",
];
export const industrialSubDomains = [
  "Industrial Automation", "Smart Manufacturing Software", "Capital Equipment",
  "Electrical & Electronics", "Clean Energy", "Building Technologies",
];
export const otherB2BSubDomains = [
  "Media & Advertising", "Professional / Business Services", "Logistics & Supply Chain (B2B)",
  "Real Estate / Commercial (B2B)", "EdTech (B2B / Institutional)", "HR-Tech / HR Services (B2B)", "Other",
];

export function subDomainsForPractice(practice: string | null): string[] {
  if (practice === "Enterprise Tech Sales & Revenue") return enterpriseTechSubDomains;
  if (practice === "Industrial & Infrastructure") return industrialSubDomains;
  if (practice === "Other B2B") return otherB2BSubDomains;
  return [];
}

// Level 1 under B2C Sales -- vertical, no further sub-level.
export const b2cVerticals = [
  "Retail", "Insurance", "Loans & Lending", "EdTech", "Real Estate",
  "Automobile", "Telecom", "Healthcare & Wellness", "Travel & Hospitality", "Other",
];

// Level 1 under Other (Non-Sales) -- function, no further sub-level, no
// fields beyond this single tag per the frozen spec.
export const nonSalesFunctions = [
  "Marketing", "Finance & Accounts", "HR", "Operations", "Customer Support / Service",
  "IT / Technology", "Legal & Compliance", "Supply Chain & Procurement", "Admin", "Other",
];

// Single entry point the unified form calls once Profile Type is chosen --
// returns the correct Level 1 list (Practice / Vertical / Function) for
// whichever Profile Type is active.
export function level1OptionsForProfileType(profileType: string | null): string[] {
  if (profileType === "b2b_sales") return [...b2bPractices];
  if (profileType === "b2c_sales") return b2cVerticals;
  if (profileType === "non_sales") return nonSalesFunctions;
  return [];
}

// ---- Secondary Specialization: cross-Profile-Type combined list -- mirrors
// jobs-staffanchor's options.ts secondarySpecializationGroups() exactly (same
// value strings, including the "Other (B2B)" / "Other (B2C)" /
// "Other (Non-Sales)" disambiguation), so a candidate created here and one
// who applies directly end up with identical secondary_sub_domains values.
// Deliberately granular (named specializations, not the 3 broad b2bPractices)
// -- see jobs-staffanchor's options.ts for the full rationale. ----
export type SecondarySpecializationGroup = {
  group: "B2B Sales" | "B2C Sales" | "Non-Sales / Other";
  options: string[];
};

const secondaryB2BOptions = [
  ...enterpriseTechSubDomains,
  ...industrialSubDomains,
  ...otherB2BSubDomains.filter((o) => o !== "Other"),
  "Other (B2B)",
];

const secondaryB2COptions = [
  "Retail (Offline / In-store)",
  "E-commerce / D2C",
  "Insurance (Life)",
  "Insurance (Health / General)",
  "Loans & Lending (Personal / Consumer)",
  "Loans & Lending (Home / Auto)",
  "Mutual Funds / Wealth Advisory (B2C)",
  "EdTech",
  "Real Estate (Residential)",
  "Automobile (Two-wheeler)",
  "Automobile (Four-wheeler)",
  "Telecom",
  "Healthcare & Wellness",
  "Fitness / Gym Memberships",
  "Travel & Hospitality",
  "OTT / Media Subscriptions",
  "FMCG / Consumer Durables (Retail)",
  "Jewellery / Luxury Retail",
  "Other (B2C)",
];

const secondaryNonSalesOptions = [
  "Performance Marketing",
  "Content Marketing",
  "Brand Marketing",
  "Growth Marketing",
  "Marketing Analytics",
  "Finance & Accounts",
  "FP&A",
  "Treasury",
  "HR Business Partner",
  "HR Recruiter / Talent Acquisition",
  "Learning & Development (L&D)",
  "Compensation & Benefits",
  "HR Operations",
  "Operations Management",
  "Process Excellence",
  "Customer Support / Service",
  "Customer Success",
  "Software Engineering / Development",
  "Quality Assurance (QA) / Testing",
  "DevOps / Site Reliability",
  "Data Science / Machine Learning",
  "Data & Analytics / BI",
  "IT Support / Infrastructure",
  "Cybersecurity / InfoSec",
  "Product Management",
  "Product Design (UI/UX)",
  "Legal & Compliance",
  "Supply Chain & Procurement",
  "Logistics",
  "Administration / Facilities",
  "Other (Non-Sales)",
];

export function secondarySpecializationGroups(): SecondarySpecializationGroup[] {
  return [
    { group: "B2B Sales", options: secondaryB2BOptions },
    { group: "B2C Sales", options: secondaryB2COptions },
    { group: "Non-Sales / Other", options: secondaryNonSalesOptions },
  ];
}

export function primaryAsSecondaryLabel(profileType: string | null, subDomain: string): string {
  if (subDomain === "Other") {
    if (profileType === "b2b_sales") return "Other (B2B)";
    if (profileType === "b2c_sales") return "Other (B2C)";
    if (profileType === "non_sales") return "Other (Non-Sales)";
  }
  return subDomain;
}

// B2C sales-motion options -- distinct from the B2B `salesMotionOptions`
// above (Outbound-Hunting/Inbound/Account-based/etc., which assumes a B2B
// buying process). B2C motions describe how the sale physically happens.
export const b2cSalesMotionOptions = [
  "Retail / Counter Sales", "Field / Door-to-door", "Telesales / Inside Sales", "Channel / Franchise-led",
];

// B2B sales-motion taxonomy -- mirrors jobs-staffanchor ApplyForm.tsx exactly
// (same group labels + option strings), so segment_data.b2b_sales_motion_type
// stays in lockstep between the candidate-facing wizard and this recruiter
// edit panel. Both candidate-facing and recruiter-facing UIs treat this as a
// multi-select (string[]).
export const b2bSalesMotionTypeGroups = [
  {
    group: "Enterprise Sales Motions (High ACV & Strategic)",
    options: [
      "Outbound Enterprise (Account-Based Marketing / ABM)",
      "Inbound Enterprise (Marketing-Led)",
      "Strategic / Named Accounts (Enterprise Expansion)",
      "Partner / Channel-Led Enterprise Sales",
    ],
  },
  {
    group: "Inside Sales / High-Velocity Motions",
    options: [
      "Inbound Transactional Sales (High-Velocity Inbound)",
      "Outbound Inside Sales (Volume Prospecting / SDR / BDR)",
      "Product-Led Sales (PLS / Active User Conversion)",
      "Inside Channel & Remote Partner Management",
    ],
  },
  {
    group: "Traditional & Industrial Sales Motions",
    options: [
      "Direct Field Engineering Sales (Consultative B2B)",
      "Distributor-Led Commercial Sales (Indirect Channel)",
    ],
  },
] as const;
export const b2bSalesMotionTypeOptions = b2bSalesMotionTypeGroups.flatMap((g) => [...g.options]);

// Industrial & Infrastructure practice-specific option sets -- mirrors
// jobs-staffanchor CareerTimelinePanel.tsx exactly (same value strings), so
// the CRM Career Timeline component and the candidate-facing form stay in
// lockstep on stored values.
export const territoryRegionOptions = ["North", "South", "West", "East", "Pan-India", "International"];
export const commercialRouteOptions = ["Direct Field", "Channel / Distributor", "Hybrid"];
export const targetAccountTypeOptions = ["OEMs", "EPC Contractors", "Government / PSU", "Industrial End-Users", "Distributors"];
export const productComplexityOptions = ["Standard Catalog Products", "Engineered / Customized Technical Solutions"];

// Average ticket size bands for B2C -- reuses the existing `dealSizeBandsB2C`
// currency-keyed bands above rather than duplicating them.

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

// ---- Languages known (mirrors jobs-staffanchor-clean's options.ts) ----
export const languageOptions = [
  "English",
  "Hindi",
  "Bengali",
  "Marathi",
  "Telugu",
  "Tamil",
  "Gujarati",
  "Urdu",
  "Kannada",
  "Odia",
  "Malayalam",
  "Punjabi",
  "Assamese",
  "Other",
];

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
  "Team Lead / Asst. Manager",
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

// ---- Career Timeline "revenue impact" fields -- per-experience metrics for
// the Sales Passport (Revenue Journey cards). Bands rather than raw numbers,
// consistent with the rest of the taxonomy (achievementBandOptions, deal size
// bands) so recruiters can filter/compare across candidates rather than
// parsing free text. ----
export const renewalRateBandOptions = ["<50%", "50-70%", "70-85%", "85-95%", "95%+"];
export const winRateBandOptions = ["<20%", "20-35%", "35-50%", "50-65%", "65%+"];

// ---- Reason for leaving a past role (kept short/dropdown so it stays fast to
// fill for every older job, not a free-text essay per company) -- mirrors
// jobs-staffanchor-clean's modules/apply/options.ts exactly.
export const reasonForLeavingOptions = [
  "Better Compensation",
  "Better Growth / Role",
  "Company Shutdown / Layoff",
  "Contract / Tenure Ended",
  "Relocation",
  "Career Change / Domain Switch",
  "Team / Manager Change",
  "Company Restructuring",
  "Health / Personal Reasons",
  "Higher Studies",
  "Other",
];

// ---- Average quarterly target band, used for roles other than the current
// one -- deliberately a single band rather than the full quarter-by-quarter
// target+achievement grid, since candidates rarely remember exact historic
// numbers. Mirrors jobs-staffanchor-clean's modules/apply/options.ts exactly.
export const avgQuarterlyTargetBandOptions = [
  "<5L / quarter",
  "5L-15L / quarter",
  "15L-30L / quarter",
  "30L-50L / quarter",
  "50L-1Cr / quarter",
  "1Cr-2Cr / quarter",
  "2Cr-5Cr / quarter",
  "5Cr+ / quarter",
];
