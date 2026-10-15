// The wording of the approved WhatsApp templates, kept in one place so the inbox can show a candidate
// exactly what they received (Meta fills the variables; we only log a preview of the result), and so the
// list we put into a template variable reads naturally inside the template's own sentence.

const NOUN: Record<string, string> = {
  cv: "latest CV",
};

/** "a", "a and b", "a, b and c". */
export function naturalList(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean);
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/**
 * What to put into {{2}} of profile_details_request, whose sentence is "we need your {{2}}".
 * Labels are used (current role, notice period...), never the "your ..." question phrases, so the
 * message does not say "your your".
 */
export function detailsPhrase(missing: { label: string }[]): string {
  return naturalList(missing.map((m) => NOUN[m.label.trim().toLowerCase()] ?? m.label.trim().toLowerCase()).map((s) => s.replace(/\bctc\b/g, "CTC")));
}

export const renderDetailsMessage = (first: string, list: string, link: string) =>
  `Hi ${first}, this is StaffAnchor regarding the profile you shared with us. To present you for suitable roles we need your ${list}. You can share them in about a minute here: ${link}\n\nIf you would rather type them, just reply to this message.`;

/**
 * profile_details_request_v2 and later carry the profile link on a "Complete my profile" button, so the
 * text has no raw link and takes only the first name and the list. Earlier versions put the link in the text.
 */
export const detailsTemplateUsesButton = (templateName: string | null | undefined): boolean => /_v\d+$/.test(templateName ?? "");

export const renderDetailsMessageButton = (first: string, list: string) =>
  `Dear ${first},\n\nStaffAnchor Talent Solutions is a Revenue Roles focused recruitment firm, and we are reviewing the profile you shared with us.\n\nTo present you for suitable roles, please share your ${list}. You may do so using the button below, or simply by replying to this message, and we will update your profile.\n\nThank you.\n\n[ Complete my profile ]`;

/** The same request as a plain chat message, for when the 24-hour window is open and no template is needed. */
export const renderDetailsFreeform = (first: string, list: string, link: string) =>
  `Dear ${first},\n\nStaffAnchor Talent Solutions is a Revenue Roles focused recruitment firm, and we are reviewing the profile you shared with us.\n\nTo present you for suitable roles, please share your ${list}. You may do so here: ${link}\n\nOr simply reply to this message, and we will update your profile.\n\nThank you.`;

export const renderOpportunityMessage = (first: string, role: string, city: string) =>
  `Hi ${first}, we have a ${role} opening in ${city} that matches your experience. Would you like us to share the details and put your profile forward?`;

export const renderInterviewMessage = (first: string, role: string) =>
  `Hi ${first}, good news: your profile has moved forward for the ${role} role and the interview is being scheduled. Please reply with the days and times that suit you over the next few days, and we will confirm the slot with you.`;

export const renderOfferMessage = (first: string, role: string) =>
  `Hi ${first}, this is StaffAnchor following up on the ${role} role. Could you let us know where you stand on the offer discussions, and whether anything is needed from our side? A short reply is enough.`;
