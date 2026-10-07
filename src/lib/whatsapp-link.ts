// Click-to-chat links: opens WhatsApp Web (or the app on a phone) with a
// message already typed in, so a recruiter only has to press Send. Needs no
// Meta credentials -- it's the bridge until the Cloud API integration in
// whatsapp.ts is switched on.

/** Indian numbers are stored as bare 10 digits; add 91. Anything longer already has a country code. */
export function whatsappDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = phone ? whatsappDigits(phone) : null;
  if (!digits) return null;
  return `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
}

// Every link opens in this one named tab, so repeated clicks reuse it
// instead of piling up new tabs.
export const WHATSAPP_TARGET = "staffanchor-whatsapp";

export type WhatsAppTemplate = { key: string; label: string; text: string };

export const firstNameOf = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "there";

export function candidateTemplates(name: string | null | undefined): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  return [
    {
      key: "intro",
      label: "Introduce an opportunity",
      text: `Hi ${n}, this is from StaffAnchor, a recruitment firm for sales roles. I came across your profile and have an opportunity I'd like to discuss. Do you have 5 minutes for a quick call today?`,
    },
    {
      key: "cv",
      label: "Ask for updated CV",
      text: `Hi ${n}, could you please share your updated CV here (PDF or Word)? Thanks, StaffAnchor`,
    },
    {
      key: "details",
      label: "Confirm CTC and notice period",
      text: `Hi ${n}, following up on our call. Could you please confirm your current CTC, expected CTC, notice period and preferred work mode? Thanks, StaffAnchor`,
    },
    {
      key: "interview",
      label: "Interview reminder",
      text: `Hi ${n}, a quick reminder about your upcoming interview. Please confirm you're all set and reply here if anything changes. Thanks, StaffAnchor`,
    },
    {
      key: "followup",
      label: "Gentle follow-up",
      text: `Hi ${n}, just checking in on the opportunity I shared. Are you still interested? Happy to answer any questions. StaffAnchor`,
    },
  ];
}

export function employerTemplates(name: string | null | undefined, role?: string | null): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  const about = role ? `hiring for ${role}` : "your hiring requirement";
  return [
    {
      key: "thanks",
      label: "Thanks for reaching out",
      text: `Hi ${n}, thanks for reaching out to StaffAnchor about ${about}. Once we confirm the brief, we share the first shortlist within 72 hours. When is a good time for a 10-minute call to understand the role?`,
    },
    {
      key: "nudge",
      label: "Follow up",
      text: `Hi ${n}, following up on your enquiry about ${about}. Happy to get started whenever you're ready. Would a quick call today or tomorrow work? StaffAnchor`,
    },
  ];
}

export function jobseekerTemplates(name: string | null | undefined): WhatsAppTemplate[] {
  const n = firstNameOf(name);
  return [
    {
      key: "reply",
      label: "Acknowledge their message",
      text: `Hi ${n}, thanks for writing to StaffAnchor. We've received your message and will get back to you shortly. If it's urgent, please reply here with details.`,
    },
    {
      key: "cv",
      label: "Ask for CV",
      text: `Hi ${n}, thanks for reaching out to StaffAnchor. Could you please share your latest CV here (PDF or Word) so we can look at suitable roles? Thanks`,
    },
  ];
}
