import { whatsappEntryLink } from "@/lib/whatsapp-entry";
import type { Entities, Intent } from "./rules";

// What to suggest next, for each thing a visitor can want. Destinations are the real pages on the two
// public sites. Nothing here names a client or promises an outcome.

export type Step = { label: string; href: string; primary?: boolean; note?: string };

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
        { label: "Create your profile (about a minute)", href: `${JOBS}/register?${params(e)}`, primary: true, note: "We match you to roles from this, and you are not asked twice." },
        { label: "See open roles", href: `${JOBS}/jobs?${params(e)}` },
        { label: "Continue on WhatsApp", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`) },
      ];
    case "employer":
      return [
        { label: "Share the role (a short form)", href: `${MAIN}/employers?${params(e)}#mandate-form`, primary: true, note: "A recruiter confirms the brief with you, then the first shortlist follows within 72 hours." },
        { label: "Talk to a recruiter on WhatsApp", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`) },
      ];
    case "referrer":
      return [
        { label: "Join the Sales Circle", href: `${MAIN}/sales-circle?${params(e)}`, primary: true, note: "Refer people you know and we handle the rest." },
        { label: "Ask a question on WhatsApp", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`) },
      ];
    case "vendor":
      return [
        { label: "Apply as a staffing partner", href: "https://vendors.staffanchor.com", primary: true },
        { label: "Contact us", href: `${MAIN}/contact` },
      ];
    case "status":
      return [
        { label: "Check on WhatsApp", href: whatsappEntryLink("Hi StaffAnchor, I would like an update on my application."), primary: true, note: "For your privacy we do not show application details here." },
        { label: "Sign in to your candidate portal", href: `${JOBS}/candidate-login` },
      ];
    case "privacy":
      return [
        { label: "Contact us about your data", href: `${MAIN}/contact`, primary: true, note: "A person handles privacy requests. Please include the email or number you registered with." },
        { label: "Read our privacy policy", href: `${MAIN}/privacy` },
      ];
    default:
      return [{ label: "Message us on WhatsApp", href: whatsappEntryLink(`Hi StaffAnchor, ${typed}`), primary: true }];
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
