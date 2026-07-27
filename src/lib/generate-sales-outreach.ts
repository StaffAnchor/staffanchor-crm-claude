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
      : "Write a cold email. Include a short, specific subject line on its own first line prefixed 'Subject: ', then the email body. Keep the body under 120 words, end with a low-friction call to action (a quick call, not a hard pitch), and sign off with just a first name placeholder, e.g. 'Gagan'.";

  const prompt = `You are a founder-led B2B sales-development assistant helping StaffAnchor's founder (a solo-run sales-recruitment agency in India that is also building an AI + human-backed Sales Passport / Recruitment OS product) reach a prospective client company -- someone who might be hiring for sales roles and could use StaffAnchor's recruiting service.

${channelInstructions}

Ground the message in a real, specific reason to reach out given the context below -- e.g. sales hiring is notoriously hard to verify, sales attrition is high, or something specific to their industry/size -- not a generic "we do recruiting" pitch. Do not invent facts about the company that aren't given below (funding, headcount, specific roles) -- if you don't have a detail, keep the reasoning general (e.g. "growing sales teams like yours") rather than inventing one. Never use the word "passionate" or "synergy". Do not fabricate quotes, stats, or claims about StaffAnchor beyond: it's a sales-specialist recruitment agency building verified, data-backed candidate profiles.

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
