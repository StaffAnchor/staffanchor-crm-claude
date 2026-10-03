// Mirror of the candidate registration form's option lists (jobs site,
// src/modules/apply/options.ts), so CVs read in bulk upload map onto the same
// choices a candidate would pick themselves. Keep the two in step.

export type PickerGroup = { group: string; options: string[] };

export const b2bSoldGroups: PickerGroup[] = [
  {
    group: "Software & technology",
    options: [
      "SaaS (horizontal)", "SaaS (vertical / industry)", "ERP / CRM / HRMS software", "Cybersecurity",
      "Cloud & infrastructure", "AI & data platforms", "IT hardware & networking", "IT services & consulting",
      "System integration", "Telecom & connectivity (B2B)", "Payments & FinTech platforms", "MarTech / AdTech",
      "HR tech & staffing services", "EdTech (institutional / B2B)", "Healthcare IT & MedTech",
    ],
  },
  {
    group: "Industrial & infrastructure",
    options: [
      "Industrial automation", "Capital equipment & machinery", "Electrical & electronics", "Building products & construction",
      "Clean energy / solar", "Chemicals & materials", "Packaging", "Auto components", "Infrastructure / EPC projects",
      "Logistics & supply chain", "Agri & food processing",
    ],
  },
  {
    group: "Services, finance & institutions",
    options: [
      "Professional & consulting services", "Corporate BFSI (cash management, group insurance, MSME lending)",
      "Commercial real estate / co-working", "Corporate travel & events", "Media & advertising",
      "Hospitals, pharma & healthcare (B2B)", "Government & institutional sales", "Channel / distributor sales",
    ],
  },
  { group: "Something else", options: ["Other B2B"] },
];

export const b2cSoldGroups: PickerGroup[] = [
  { group: "Financial products", options: ["Life insurance", "Health / general insurance", "Personal & home loans", "Credit cards & banking products", "Mutual funds & wealth", "Consumer fintech apps"] },
  { group: "Education", options: ["EdTech (K-12)", "EdTech (test prep / coaching)", "EdTech (upskilling / higher-ed)", "Study abroad / overseas consulting"] },
  { group: "Property, auto & energy", options: ["Residential real estate", "Cars & two-wheelers", "Solar / home energy"] },
  { group: "Consumer & retail", options: ["Electronics & appliances retail", "Fashion, jewellery & lifestyle", "D2C / e-commerce", "FMCG / consumer durables", "Telecom, broadband & DTH"] },
  { group: "Health, travel & subscriptions", options: ["Healthcare & diagnostics", "Wellness, fitness & beauty", "Travel & hospitality", "Matrimony, classifieds & subscriptions"] },
  { group: "Something else", options: ["Other consumer sales"] },
];

export const industrySoldGroups: PickerGroup[] = [
  { group: "Technology", options: ["SaaS / Cloud Software", "ERP / CRM / HRMS Software", "AI / ML Products", "Data & Analytics Platforms", "Cybersecurity", "IT Infrastructure & Hardware", "IT Services & Consulting", "System Integration", "Telecom & Networking", "Semiconductors / Electronics", "Fintech / Digital Payments", "Media / Advertising / MarTech", "Staffing / HR Tech"] },
  { group: "Banking, finance & insurance", options: ["Life Insurance", "Health / General Insurance", "Insurance Broking / Distribution", "Mutual Funds / Wealth Management", "Banking (Retail)", "Banking (Corporate / SME)", "NBFC / Microfinance", "Housing Finance", "Credit Cards / Lending", "Stock Broking / Capital Markets", "Real Estate Finance", "Forex / Remittance"] },
  { group: "Healthcare & life sciences", options: ["Pharma (Ethical / Rx)", "Pharma (OTC / Consumer)", "Medical Devices & Diagnostics", "Diagnostic Labs", "Hospital & Healthcare Services", "Biotech", "Nutraceuticals & HealthTech", "Dental / Optical"] },
  { group: "Consumer & retail", options: ["FMCG", "Consumer Durables", "Consumer Electronics", "D2C Brands", "E-commerce / Marketplaces", "Fashion & Apparel", "Luxury & Premium Goods", "Modern Trade / Retail Chains", "QSR / Food & Beverage", "Beauty & Personal Care", "Jewellery"] },
  { group: "Industrial & manufacturing", options: ["Industrial Equipment & Machinery", "Industrial Automation", "Electrical & Electronics Equipment", "Automotive & Auto Components", "Chemicals & Specialty Chemicals", "Steel / Metals / Mining", "Packaging", "Textiles", "Agrochemicals / Seeds", "Construction Materials"] },
  { group: "Energy, real estate & infrastructure", options: ["Renewable Energy / Solar", "Oil & Gas / Energy", "Infrastructure / EPC Projects", "Smart City Projects", "Residential Real Estate", "Commercial Real Estate", "Co-working / Managed Spaces"] },
  { group: "Education & services", options: ["EdTech / Training & Skilling", "K-12 / Schools", "Higher Education / Universities", "Test Prep / Coaching", "Study Abroad / Overseas Education", "Logistics & Supply Chain", "Legal Tech / Professional Services", "Consulting", "Travel & Hospitality", "Events & Experiential", "Media & Entertainment"] },
  { group: "Public sector & other", options: ["Government / Public Sector", "Defence", "Agri & Food Processing", "Non-profit / Social Enterprise", "Other"] },
];

export const yourLevelOptions: { value: string; label: string; lead: boolean; salesOnly?: boolean }[] = [
  { value: "IC – Sales Development", label: "SDR / BDR", lead: false, salesOnly: true },
  { value: "IC – Account Executive", label: "AE / Sales Executive", lead: false, salesOnly: true },
  { value: "IC", label: "Senior IC / Key Accounts", lead: false },
  { value: "Team Lead / Asst. Manager", label: "Team Lead", lead: true },
  { value: "Manager", label: "Manager", lead: true },
  { value: "Senior Manager", label: "Sr Manager / AGM", lead: true },
  { value: "Director", label: "Director / GM", lead: true },
  { value: "VP / Head", label: "VP / Head / CRO", lead: true },
  { value: "Founder / CXO", label: "Founder / CXO", lead: true },
];

export const customerSegmentOptions = ["SMB", "Mid-Market", "Enterprise", "MNC", "Startup", "Government"];

export const teamSizeBands = ["1-5", "6-10", "11-20", "21-30", "31-40", "41-50", "51-75", "76-100", "101-150"];

export const flat = (groups: PickerGroup[]): string[] => groups.flatMap((g) => g.options);
export const keepAllowed = (values: unknown, allowed: string[], max = 20): string[] =>
  Array.isArray(values)
    ? Array.from(new Set(values.filter((v): v is string => typeof v === "string" && allowed.includes(v)))).slice(0, max)
    : [];
