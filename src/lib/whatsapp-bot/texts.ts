// Everything the assistant says. Short, plain, one question at a time, always with an
// example, and always with a way out. Nothing here ever mentions a client company.
export const SITE_LINK = "https://jobs.staffanchor.com/candidate-login";

export const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] || "there";

export const MENU = `Hi! Thanks for messaging StaffAnchor. To help you quickly, please reply with a number:

1 - I'm looking for a job
2 - I'm hiring sales talent
3 - Something else`;

export const MENU_REMINDER = `Sorry, I didn't catch that. Please reply with 1, 2 or 3:

1 - I'm looking for a job
2 - I'm hiring sales talent
3 - Something else`;

export const EMPLOYER_ACK = `Thanks for reaching out to StaffAnchor! A consultant will contact you shortly. To help us prepare, please share your company name and the sales role(s) you're hiring for.`;

export const OTHER_ACK = `Thanks for messaging StaffAnchor. Please tell us how we can help, and a member of our team will reply here shortly.`;

export const REFERRER_ACK = `Thanks for messaging StaffAnchor. A member of our team will reply here shortly.`;

export const HUMAN_ACK = `Okay, I've passed this to a recruiter. They'll reply here shortly.`;

export const STOP_ACK = `Understood. You won't get any more automated messages from us. If you need help later, just message us.`;

export const DIFFERENT_QUERY_ACK = `Thanks, I've passed your message to a recruiter, who'll reply here. If you'd also like to set up your profile, reply PROFILE at any time.`;

export const INTRO = `Hi! I'm StaffAnchor's assistant. I'll set up your profile with a few quick questions (about 2 minutes). You can reply SKIP to pass on a question, or STOP at any time.`;

export const QUESTION: Record<string, (name?: string) => string> = {
  name: () => `First, what's your full name?`,
  role: (n) => `Thanks, ${n ?? "there"}! What's your current role and company? (for example: Sales Manager at Acme)`,
  experience: () => `How many years of total work experience do you have? (for example: 6 or 6.5)`,
  category: () => `What best describes your selling?\n\n1 - B2B (selling to businesses)\n2 - B2C (selling to consumers)\n3 - Not in sales / other`,
  ctc: () => `What is your current fixed CTC per year? (for example: 12 lakhs). Reply SKIP if you'd rather not say.`,
  expected: () => `And your expected fixed CTC per year? (for example: 15 lakhs). Reply SKIP to pass.`,
  notice: () => `What is your notice period? (for example: Immediate, 30 days, or 2 months)`,
  location: () => `Which city are you based in?`,
  email: () => `What's your email address? We'll use it to send your profile link and job updates.`,
  cv: () => `Last one: please send your latest CV here as a PDF or Word file, or reply SKIP.`,
};

export const HINT: Record<string, string> = {
  name: `I need your name as you'd like it on your profile, for example: Rohan Mehta.`,
  role: `Please tell me your current role, and your company if you can, for example: Sales Manager at Acme.`,
  experience: `Please reply with a number of years, for example: 6 or 6.5. Reply 0 if you're a fresher.`,
  category: `Please reply 1, 2 or 3.`,
  ctc: `Please give a single yearly amount, for example: 12 lakhs, 12 LPA or 1200000.`,
  expected: `Please give a single yearly amount, for example: 15 lakhs or 15 LPA.`,
  notice: `Please say how long, for example: Immediate, 15 days, 30 days or 2 months. If you're serving notice, tell me how many days are left.`,
  location: `Please reply with the city you're based in, for example: Gurgaon.`,
  email: `That doesn't look like an email address. Please reply with it written out, for example: rohan@gmail.com.`,
};

export const NEEDED = `That one is needed to set up your profile.`;
export const SKIPPED = `No problem, we'll skip that one.`;
export const NON_TEXT = `I can only read text messages and documents here.`;
export const CV_THANKS = `Got your CV, thank you! I'll attach it to your profile.`;
export const CV_WRONG_TYPE = `I couldn't use that file. Please send your CV as a PDF or Word document, or reply SKIP.`;

export const SAVED = (n: string) => `Thanks, ${n}! Your profile is saved.`;
export const DONE = (n: string) =>
  `All set, ${n}! A recruiter will review your profile and contact you when a role fits. You can add more details any time here: ${SITE_LINK}`;
export const DONE_NEEDS_RECRUITER = (n: string) =>
  `Thanks, ${n}! I've noted your details and a recruiter will finish setting up your profile and be in touch.`;
export const LINKED_EXISTING = (n: string) =>
  `Welcome back, ${n}! You're already registered with StaffAnchor, so I've linked this WhatsApp number to your profile. A recruiter will contact you when a role fits.`;
export const WELCOME_BACK = `Welcome back! Let's pick up where we left off.`;
export const RESTARTED = `No problem, let's start again.`;

export const KNOWN_ACK = (n: string) => `Hi ${n}, thanks for your message. A recruiter will reply here shortly.`;
export const CV_RETRY = `I couldn't open that file. Please try sending your CV again as a PDF or Word document, or reply SKIP and a recruiter will follow up.`;
