import { GoogleGenerativeAI } from "@google/generative-ai";

export type GeneratedJd = {
  overview: string;
  responsibilities: string[];
  candidate_profile: string[];
  compensation_benefits: string[];
};

export type GenerateJdResult = { ok: true; jd: GeneratedJd } | { ok: false; status: number; error: string };

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales / Other",
};

function parseJdJson(raw: string): GeneratedJd | null {
  // Gemini sometimes wraps JSON in a ```json fence despite instructions not to.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.overview === "string" &&
      Array.isArray(parsed.responsibilities) &&
      Array.isArray(parsed.candidate_profile) &&
      Array.isArray(parsed.compensation_benefits)
    ) {
      return {
        overview: parsed.overview,
        responsibilities: parsed.responsibilities.map(String),
        candidate_profile: parsed.candidate_profile.map(String),
        compensation_benefits: parsed.compensation_benefits.map(String),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

export async function generateJdFromNotes(input: {
  role_title: string;
  category: string;
  sub_domains: string[];
  cities: string[];
  experience_min: string;
  experience_max: string;
  budget_min: string;
  budget_max: string;
  raw_notes: string;
}): Promise<GenerateJdResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "AI JD generation is not configured yet (missing GEMINI_API_KEY on the server).",
    };
  }
  if (!input.raw_notes?.trim()) {
    return { ok: false, status: 400, error: "Paste some rough notes first." };
  }

  const facts = [
    input.role_title && `Role title: ${input.role_title}`,
    input.category && `Function / Domain: ${CATEGORY_LABEL[input.category] ?? input.category}`,
    input.sub_domains.length && `Sub-domain(s): ${input.sub_domains.join(", ")}`,
    input.cities.length && `Location(s): ${input.cities.join(", ")}`,
    (input.experience_min || input.experience_max) &&
      `Experience: ${input.experience_min || "?"}-${input.experience_max || "?"} years`,
    (input.budget_min || input.budget_max) &&
      `Compensation budget: ₹${input.budget_min || "?"}-${input.budget_max || "?"} LPA`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are a recruiting copywriter turning a recruiter's rough notes into a polished, well-organized job description for a public job listing site. Be concrete and specific -- use only facts present in the notes/context below, don't invent numbers or claims that aren't there. Keep tone professional but energetic, matching a modern tech-recruiting brand (not generic corporate boilerplate).

Known facts about this role:
${facts || "(none provided beyond the notes below)"}

Recruiter's rough notes:
${input.raw_notes}

Return ONLY a JSON object (no markdown fence, no commentary) with this exact shape:
{
  "overview": "1-2 sentence intro to the role and company/context, no bullet points",
  "responsibilities": ["bullet 1", "bullet 2", ...],
  "candidate_profile": ["bullet 1", "bullet 2", ...],
  "compensation_benefits": ["bullet 1", "bullet 2", ...]
}
Each array should have 3-8 concise bullets (no leading dashes or bullet characters -- just the sentence). If the notes don't mention compensation/benefits beyond what's in "Known facts", it's fine to synthesize a couple of generic-but-plausible bullets from the budget figure given, but do not fabricate specific perks that weren't mentioned.`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const jd = parseJdJson(raw);
      if (!jd) {
        lastError = new Error("Model response was not valid JSON.");
        continue;
      }
      return { ok: true, jd };
    } catch (err) {
      lastError = err;
      console.error(`Gemini JD generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota on Google's side. Generate a fresh key at aistudio.google.com/apikey and swap GEMINI_API_KEY in Vercel, or enable billing for standard paid-tier limits."
      : "AI JD generation failed. Please try again.";
  return { ok: false, status: 500, error: message };
}
