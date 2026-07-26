import { GoogleGenerativeAI } from "@google/generative-ai";

export type ReplyDraftResult =
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
 * Drafts a WhatsApp reply from recent conversation history, so a recruiter
 * reviews/edits and sends instead of typing a reply from scratch every time.
 * Same house pattern as generate-mandate-discussion-summary.ts: model
 * fallback list, JSON-only response, never throws.
 */
export async function generateReplyDraft(input: {
  candidate_name: string;
  role_title?: string | null;
  client_name?: string | null;
  history: { direction: "inbound" | "outbound"; body: string; at: string }[];
}): Promise<ReplyDraftResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "AI reply drafting is not configured (missing GEMINI_API_KEY)." };
  }
  if (!input.history.length) {
    return { ok: false, status: 400, error: "No conversation history to draft a reply from." };
  }

  const transcript = input.history
    .map((m) => `${m.direction === "inbound" ? input.candidate_name : "Recruiter"}: ${m.body}`)
    .join("\n");

  const contextLine = input.role_title
    ? `This candidate is in the pipeline for the "${input.role_title}" role${input.client_name ? ` at ${input.client_name}` : ""}.`
    : "";

  const prompt = `You are a sales recruiter's assistant, drafting a WhatsApp reply on the recruiter's behalf for them to review before sending. ${contextLine}

Below is the recent WhatsApp conversation with ${input.candidate_name.split(/\s+/)[0]}, oldest first. Write a short, warm, professional reply to their most recent message -- the kind a good recruiter would actually send, not a generic template. Keep it under 3 sentences, WhatsApp-appropriate (no email-style greetings/sign-offs), and don't invent facts (dates, offers, decisions) that aren't in the conversation -- if the reply needs a real fact you don't have, write a reply that asks for it or acknowledges without committing to specifics.

Conversation:
${transcript}

Return ONLY JSON, no markdown fence:
{"draft": "the reply text"}`;

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
      console.error(`Gemini reply-draft generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota on Google's side. Generate a fresh key at aistudio.google.com/apikey and swap GEMINI_API_KEY in Vercel, or enable billing for standard paid-tier limits."
      : "AI reply drafting failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
