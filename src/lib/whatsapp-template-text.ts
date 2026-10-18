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

// The two campaign templates. The wording below is what is submitted to Meta; the exact text is fixed once approved.
// The approved "still_open_check" template: one variable (the first name), two reply buttons ("Yes, I'm open", "Not looking").
export const renderReactivationMessage = (first: string) =>
  `Hi ${first}, quick check from StaffAnchor: are you still open to new sales roles? Please reply with your current CTC, expected CTC and notice period.`;

export const renderReferralAskMessage = (first: string) =>
  `Hi ${first}, thank you for being part of StaffAnchor. The best people we place often come through someone they trust. Is there a sales professional you would back? Share their name in under a minute. If we place them and they stay 90 days, you earn up to \u20B910,000.`;

export const renderReferralRoleMessage = (first: string, role: string, city: string) =>
  `Hi ${first}, we're hiring a ${role} in ${city}. Know a strong sales professional who'd fit? Tap to see the role and refer them. If we place them and they stay 90 days, you earn up to \u20B910,000.`;

export const renderFollowUpMessage = (first: string) =>
  `Hi ${first}, thank you for your message to StaffAnchor, and sorry for the delay. Please reply to this message and a recruiter will continue the conversation with you here.`;

/** What to create in Meta's template manager, with the buttons each one needs. */
export const CAMPAIGN_TEMPLATES = {
  reactivation: {
    envVar: "WHATSAPP_TEMPLATE_REACTIVATION",
    suggestedName: "still_open_check",
    category: "Marketing",
    body: "Hi {{1}}, quick check from StaffAnchor: are you still open to new sales roles? Please reply with your current CTC, expected CTC and notice period.",
    variables: "{{1}} first name",
    buttons: 'Quick reply "Yes, I\u2019m open", quick reply "Not looking"',
  },
  referral: {
    envVar: "WHATSAPP_TEMPLATE_REFERRAL_ASK",
    suggestedName: "referral_ask_v1",
    category: "Marketing",
    body: "Hi {{1}}, thank you for being part of StaffAnchor. The best people we place often come through someone they trust. Is there a sales professional you would back? Share their name in under a minute. If we place them and they stay 90 days, you earn up to \u20B910,000.",
    variables: "{{1}} first name",
    buttons: 'First a "Visit website" button named "Refer someone" with the dynamic URL https://jobs.staffanchor.com/refer/{{1}}, then quick reply "Stop messages"',
  },
  referralRole: {
    envVar: "WHATSAPP_TEMPLATE_REFERRAL_ROLE_ASK",
    suggestedName: "referral_role_ask_v1",
    category: "Marketing",
    body: "Hi {{1}}, we're hiring a {{2}} in {{3}}. Know a strong sales professional who'd fit? Tap to see the role and refer them. If we place them and they stay 90 days, you earn up to \u20B910,000.",
    variables: "{{1}} first name, {{2}} role title, {{3}} city",
    buttons: 'First a "Visit website" button named "Refer someone" with the dynamic URL https://jobs.staffanchor.com/refer/{{1}}, then quick reply "Stop messages"',
  },
  followUp: {
    envVar: "WHATSAPP_TEMPLATE_FOLLOW_UP",
    suggestedName: "conversation_followup_v1",
    category: "Utility",
    body: "Hi {{1}}, thank you for your message to StaffAnchor, and sorry for the delay. Please reply to this message and a recruiter will continue the conversation with you here.",
    variables: "{{1}} first name",
    buttons: 'Quick reply "Continue"',
  },
} as const;
