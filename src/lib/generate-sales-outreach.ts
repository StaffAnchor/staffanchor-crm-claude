import { GoogleGenerativeAI } from "@google/generative-ai";

export type OutreachChannel = "linkedin" | "email";

export type OutreachDraftResult =
  | { ok: true; draft: string }
  | { ok: false; status: number; error: string };

function parseDraftJson(raw: string): { draft?: string } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as { draft?: string };
  } catch {
    // fall through
  }
  return null;
}

/**
 * Drafts a personalized outbound message (LinkedIn DM or cold email) to a
 * sales-lead prospect, so the founder reviews/edits and sends instead of
 * writing from scratch every time -- the "AI-drafted outreach" half of the
 * 4-5-AEs-worth-of-help ask. Same house pattern as generate-reply-draft.ts:
 * model fallback list, JSON-only response, never throws.
 */
export async function generateSalesOutreach(input: {
  channel: OutreachChannel;
  company_name: string;
  contact_name?: string | null;
  contact_title?: string | null;
  company_industry?: string | null;
  company_size?: string | null;
  source?: string | null;
  notes?: string | null;
  stage?: string | null;
  // Overridable so an ad hoc draft (company spotted on LinkedIn, not yet a
  // sales_leads row) can still be signed correctly; defaults to the founder.
  sender_name?: string | null;
}): Promise<OutreachDraftResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "AI outreach drafting is not configured (missing GEMINI_API_KEY)." };
  }

  const contextLines = [
    `Company: ${input.company_name}`,
    input.contact_name ? `Contact: ${input.contact_name}${input.contact_title ? ` (${input.contact_title})` : ""}` : null,
    input.company_industry ? `Industry: ${input.company_industry}` : null,
    input.company_size ? `Company size: ${input.company_size}` : null,
    input.source ? `How this lead came in: ${input.source}` : null,
    input.notes ? `Notes on this prospect: ${input.notes}` : null,
    input.stage ? `Current pipeline stage: ${input.stage}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const channelInstructions =
    input.channel === "linkedin"
      ? "Write a LinkedIn connection/DM message. Under 500 characters, no subject line, casual-professional tone, no email-style greeting like 'Dear' or sign-off with a full name -- just a first-name opener if you have one."
      : "Write a cold email. Include a short, specific subject line on its own first line prefixed 'Subject: ', then the email body. Keep the body under 120 words, end with a low-friction call to action (a quick call, not a hard pitch), and sign off with just a first name placeholder.";

  const senderName = input.sender_name?.trim() || "Gagan";

  const prompt = `You are drafting a first-person outreach message for ${senderName}, founder of StaffAnchor -- a revenue-focused recruitment firm that specializes exclusively in placing B2B / Enterprise SaaS sales talent (Account Executives, SDRs/BDRs, Sales Leaders, Customer Success/Revenue roles). This message is sent directly by ${senderName} as the founder, not by a generic company account or a recruiter on staff -- write it in first person ("I").

${senderName}'s own background, which is the core credibility to draw on (use it briefly and naturally, don't recite it like a resume): before founding StaffAnchor, ${senderName} personally led large B2B/Enterprise SaaS sales and revenue teams for 16 years -- so this isn't outreach from someone who has only recruited for sales roles, it's from someone who has carried the number themselves, hired and managed sales orgs, and understands exactly what "good" looks like in an AE, SDR, or sales leader. That's the differentiator versus a typical recruiter: this is a former sales/revenue leader helping other B2B/Enterprise SaaS companies hire the same caliber of talent he used to hire and manage himself.

${channelInstructions}

Ground the message in a real, specific reason to reach out given the context below -- e.g. B2B/Enterprise SaaS sales hiring is notoriously hard to get right from the outside, sales attrition/ramp-time is a real cost, or something specific to their industry/size -- not a generic "we do recruiting" pitch. Do not invent facts about the company that aren't given below (funding, headcount, specific open roles) -- if you don't have a detail, keep the reasoning general (e.g. "scaling a B2B/Enterprise SaaS sales team like yours") rather than inventing one. Never use the word "passionate" or "synergy". Do not fabricate quotes, stats, or claims about StaffAnchor beyond: it specializes in B2B/Enterprise SaaS sales hiring and builds verified, data-backed candidate profiles.

Context:
${contextLines || "(no further context provided)"}

Return ONLY JSON, no markdown fence:
{"draft": "the message text${input.channel === "email" ? " including the Subject: line" : ""}"}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const parsed = parseDraftJson(raw);
      if (!parsed?.draft) {
        lastError = new Error("Model response was not valid JSON.");
        continue;
      }
      return { ok: true, draft: parsed.draft };
    } catch (err) {
      lastError = err;
      console.error(`Gemini sales-outreach generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota on Google's side. Generate a fresh key at aistudio.google.com/apikey and swap GEMINI_API_KEY in Vercel, or enable billing for standard paid-tier limits."
      : "AI outreach drafting failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
