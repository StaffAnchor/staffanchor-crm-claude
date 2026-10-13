import { whatsappEntryLink } from "@/lib/whatsapp-entry";
import type { Entities, Intent } from "./rules";

// What to suggest next, for each thing a visitor can want. Destinations are the real pages on the two
// public sites. Nothing here names a client or promises an outcome. The first (primary) step is the one
// action that moves them forward; the rest are "more that may help" tiles for the same visitor.

export type IconName =
  | "profile" | "roles" | "whatsapp" | "score" | "interview" | "writing" | "form" | "hiring"
  | "leaders" | "insight" | "circle" | "agency" | "contact" | "shield" | "portal" | "tools";

export type Step = { label: string; href: string; desc: string; icon: IconName; primary?: boolean; note?: string };

const MAIN = "https://staffanchor.com";
const JOBS = "https://jobs.staffanchor.com";

const params = (e: Entities, extra: Record<string, string> = {}) => {
  const q = new URLSearchParams({ src: "assist", ...extra });
  if (e.role) q.set("role", e.role);
  if (e.city) q.set("city", e.city);
  return q.toString();
};

export function stepsFor(intent: Intent, e: Entities, message: string): Step[] {
  const typed = message.trim().slice(0, 240);
  switch (intent) {
    case "jobseeker":
      return [
        { label: "Create your profile", desc: "About a minute. Upload your CV and we fill it in for you.", href: `${JOBS}/register?${params(e)}`, icon: "profile", primary: true, note: "We match you to roles from this, and you are not asked twice." },
        { label: "See open roles", desc: "Live sales roles, ranked by fit once you have a profile.", href: `${JOBS}/jobs?${params(e)}`, icon: "roles" },
        { label: "Check your resume score", desc: "See how your CV reads to hiring teams, free.", href: `${JOBS}/ats-score`, icon: "score" },
        { label: "Practise an interview", desc: "A mock sales interview with feedback.", href: `${JOBS}/mock-interview`, icon: "interview" },
        { label: "Continue on WhatsApp", desc: "Prefer chat? Send this message to a recruiter.", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`), icon: "whatsapp" },
      ];
    case "employer":
      return [
        { label: "Share the role", desc: "A short form: role, city, budget and must-haves.", href: `${MAIN}/employers?${params(e)}#mandate-form`, icon: "form", primary: true, note: "A recruiter confirms the brief with you, then the first shortlist follows within 72 hours." },
        { label: "How we hire sales teams", desc: "Our process, from brief to shortlist.", href: `${MAIN}/sales-hiring`, icon: "hiring" },
        { label: "Leadership hiring", desc: "For heads of sales, country heads and above.", href: `${MAIN}/leadership-hiring`, icon: "leaders" },
        { label: "Sales talent intelligence", desc: "What the market for your role looks like.", href: `${MAIN}/sales-talent-intelligence`, icon: "insight" },
        { label: "Talk to a recruiter", desc: "Send this message on WhatsApp.", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`), icon: "whatsapp" },
      ];
    case "referrer":
      return [
        { label: "Join the Sales Circle", desc: "Refer people you know and we handle the rest.", href: `${MAIN}/sales-circle?${params(e)}`, icon: "circle", primary: true },
        { label: "Ask a question", desc: "Send this message on WhatsApp.", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`), icon: "whatsapp" },
        { label: "About StaffAnchor", desc: "Who we are and how we work.", href: `${MAIN}/about-us`, icon: "contact" },
      ];
    case "vendor":
      return [
        { label: "Apply as a staffing partner", desc: "A short application for agencies.", href: "https://vendors.staffanchor.com", icon: "agency", primary: true },
        { label: "Contact us", desc: "Tell us how you would like to work together.", href: `${MAIN}/contact`, icon: "contact" },
      ];
    case "status":
      return [
        { label: "Check on WhatsApp", desc: "A recruiter will look up your application.", href: whatsappEntryLink("Hi StaffAnchor, I would like an update on my application."), icon: "whatsapp", primary: true, note: "For your privacy we do not show application details here." },
        { label: "Sign in to your portal", desc: "See every application and its stage.", href: `${JOBS}/candidate-login`, icon: "portal" },
      ];
    case "privacy":
      return [
        { label: "Contact us about your data", desc: "A person handles privacy requests.", href: `${MAIN}/contact`, icon: "shield", primary: true, note: "Please include the email or number you registered with." },
        { label: "Read our privacy policy", desc: "What we keep and why.", href: `${MAIN}/privacy`, icon: "form" },
      ];
    default:
      return [
        { label: "Message us on WhatsApp", desc: "Tell a recruiter what you need.", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`), icon: "whatsapp", primary: true },
        { label: "Free tools", desc: "Resume score, salary and more, no sign-up.", href: `${MAIN}/free-tools`, icon: "tools" },
      ];
  }
}

/** The options shown when we are not sure, so the visitor tells us in one tap instead of retyping. */
export const CLARIFY_OPTIONS: { intent: Intent; label: string }[] = [
  { intent: "jobseeker", label: "I am looking for a job" },
  { intent: "employer", label: "I am hiring" },
  { intent: "referrer", label: "I want to refer people" },
  { intent: "vendor", label: "I run a staffing agency" },
  { intent: "other", label: "Something else" },
];
