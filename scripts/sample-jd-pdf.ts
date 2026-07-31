import fs from "fs";
import path from "path";
import { renderJdPdf, type JdPdfMandate } from "../src/lib/generate-jd-pdf";

const mandate: JdPdfMandate = {
  role_title: "Enterprise Account Executive",
  client_name: "Confidential SaaS Company",
  show_client_name: false,
  public_client_label: "A Series-C, US-headquartered B2B SaaS company",
  category: "b2b_sales",
  sub_domain: null,
  sub_domains: ["Enterprise Sales", "SaaS"],
  city: null,
  cities: ["Bengaluru", "Remote"],
  budget_min: 18,
  budget_max: 28,
  experience_min: 5,
  experience_max: 9,
  work_mode: "Hybrid",
  jd_overview:
    "StaffAnchor is mandated to hire an Enterprise Account Executive on behalf of our client, a fast-growing Series-C SaaS company building workflow automation tools for mid-market and enterprise finance teams. This is a high-visibility, quota-carrying role reporting directly to the client's VP of Sales, owning the full enterprise sales cycle from qualification through close.",
  jd_responsibilities:
    "Own the end-to-end enterprise sales cycle for accounts with 500+ employees, from prospecting through contract signature\nCarry and consistently exceed an annual quota of $1.2M+ in new ARR\nBuild and manage a pipeline of enterprise opportunities through a mix of outbound prospecting and inbound qualification\nRun a multi-threaded, consultative sales process involving finance, IT, and executive stakeholders\nPartner closely with Solutions Engineering to run technical evaluations and proofs of concept\nNegotiate commercial terms and close 6-7 figure annual contracts\nMaintain accurate forecasting and pipeline hygiene in Salesforce",
  jd_candidate_profile:
    "5-9 years of full-cycle enterprise SaaS sales experience, ideally in fintech, workflow automation, or vertical SaaS\nConsistent track record of exceeding quota in an enterprise or strategic sales role\nExperience running complex, multi-stakeholder sales cycles with 3-6 month deal timelines\nComfortable navigating procurement, legal, and security review processes typical of enterprise buyers\nStrong written and verbal communication skills; confident presenting to C-suite audiences\nBachelor's degree or equivalent practical experience",
  jd_compensation_benefits:
    "Base + variable compensation of Rs. 18-28 LPA fixed, with uncapped commission on top\nComprehensive health insurance for self and family\nESOPs in a fast-growing, well-funded company\nFlexible hybrid work model with quarterly in-person team offsites\nAnnual learning & development budget",
  must_haves: [
    "5+ years of enterprise B2B SaaS full-cycle sales experience",
    "Track record of carrying and exceeding a $750K+ annual quota",
  ],
  good_to_haves: [
    "Experience selling into finance or accounting personas",
    "Prior experience at a Series B-D startup",
  ],
};

async function main() {
  const buffer = await renderJdPdf(mandate);
  const outPath = path.join(process.cwd(), "sample-jd.pdf");
  fs.writeFileSync(outPath, buffer);
  console.log("Wrote", outPath, buffer.length, "bytes");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
