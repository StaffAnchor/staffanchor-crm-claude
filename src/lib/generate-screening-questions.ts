import { GoogleGenerativeAI } from "@google/generative-ai";

export type ScreeningQuestion = {
  id: string;
  text: string;
  source: "ai" | "recruiter";
};

export type GenerateScreeningQuestionsResult =
  | { ok: true; questions: ScreeningQuestion[] }
  | { ok: false; status: number; error: string };

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales / Other",
};

function parseQuestionsJson(raw: string): string[] | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (parsed && Array.isArray((parsed as { questions?: unknown }).questions)) {
      return (parsed as { questions: unknown[] }).questions.map(String);
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Generates a starter screening-question bank for a mandate -- specific
 * enough (using sales-cycle, deal-size, customer-profile, and JD context)
 * that a recruiter has real, targeted things to ask a candidate rather than
 * generic "tell me about yourself" questions. Recruiters can edit/add/remove
 * after generation; the mandate stores the resulting list, not just the raw
 * AI output.
 */
export async function generateScreeningQuestions(input: {
  role_title: string;
  category: string;
  sub_domains: string[];
  sales_cycle?: string;
  deal_size_band?: string;
  customer_profile?: string;
  jd_candidate_profile?: string;
  must_haves?: string[];
}): Promise<GenerateScreeningQuestionsResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "AI screening-question generation is not configured yet (missing GEMINI_API_KEY on the server).",
    };
  }
  if (!input.role_title?.trim()) {
    return { ok: false, status: 400, error: "Save the role title first." };
  }

  const facts = [
    `Role title: ${input.role_title}`,
    input.category && `Function / Domain: ${CATEGORY_LABEL[input.category] ?? input.category}`,
    input.sub_domains?.length && `Sub-domain(s): ${input.sub_domains.join(", ")}`,
    input.sales_cycle && `Typical sales cycle for this role: ${input.sales_cycle}`,
    input.deal_size_band && `Typical deal size: ${input.deal_size_band}`,
    input.customer_profile && `Target customer profile: ${input.customer_profile}`,
    input.must_haves?.length && `Must-haves: ${input.must_haves.join("; ")}`,
    input.jd_candidate_profile && `Candidate profile notes: ${input.jd_candidate_profile}`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are an experienced sales recruiter preparing a targeted screening-call question list for a specific hiring mandate. Use the facts below to write SPECIFIC questions that would actually reveal whether a candidate fits this exact role -- not generic interview questions that could apply to any job.

Mandate facts:
${facts}

Return ONLY a JSON array of 6-8 short question strings (no markdown fence, no commentary, no numbering). Each question should be answerable in a few sentences on a screening call and should probe something specific to this role's domain (e.g. deal size handled, sales cycle experience, customer segment familiarity, team size managed) rather than generic soft-skill questions.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const list = parseQuestionsJson(raw);
      if (!list) {
        lastError = new Error("Model response was not valid JSON.");
        continue;
      }
      const questions: ScreeningQuestion[] = list
        .filter((t) => t && t.trim())
        .map((text) => ({
          id: crypto.randomUUID(),
          text: text.trim(),
          source: "ai" as const,
        }));
      return { ok: true, questions };
    } catch (err) {
      lastError = err;
      console.error(`Gemini screening-question generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota on Google's side. Generate a fresh key at aistudio.google.com/apikey and swap GEMINI_API_KEY in Vercel, or enable billing for standard paid-tier limits."
      : "AI screening-question generation failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
