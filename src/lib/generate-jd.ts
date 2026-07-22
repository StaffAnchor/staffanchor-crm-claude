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

// Replaces any occurrence of the client's real name with a neutral stand-in.
// This runs on the AI output regardless of what the prompt says, so a client
// name pasted into raw_notes (e.g. a client's own JD pasted verbatim) can
// never leak into a public job listing even if the model ignores the
// instruction not to mention it.
function scrubClientName<T extends string | string[]>(value: T, clientName: string | undefined): T {
  if (!clientName || !clientName.trim()) return value;
  const escaped = clientName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\b${escaped}\\b`, "gi");
  if (Array.isArray(value)) {
    return value.map((v) => v.replace(pattern, "our client")) as T;
  }
  return (value as string).replace(pattern, "our client") as T;
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
  client_name?: string;
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

  const prompt = `You are a recruiting copywriter at StaffAnchor, a specialist recruiting firm, turning a recruiter's rough notes into a polished, well-organized job description for StaffAnchor's own public job listing site. Be concrete and specific -- use only facts present in the notes/context below, don't invent numbers or claims that aren't there. Keep tone professional but energetic, matching a modern tech-recruiting brand (not generic corporate boilerplate).

VOICE -- READ CAREFULLY: This listing must read as StaffAnchor writing about a mandate it has been engaged to fill, never as if the hiring company wrote it about itself. Frame it as "StaffAnchor is hiring on behalf of our client, a [industry/space] company, for..." or equivalent -- third person, recruiter's voice, not first-person "we/our team" as if you work at the client. Do not write "Join our team" or "we are looking for" in the client's voice; write "Our client is looking for" / "StaffAnchor is mandated to hire" instead. This applies especially to the overview field, but keep the same third-party framing throughout responsibilities, candidate profile, and compensation/benefits (e.g. "you'll report to the client's Sales Head" rather than "you'll report to our Sales Head").

CONFIDENTIALITY -- READ CAREFULLY: The recruiter's rough notes below may be a client's raw job description pasted verbatim, and it may contain the hiring company's actual name. This listing is published on a public job board where the client's identity must stay confidential. Do NOT mention the client's company name anywhere in your output, even if it appears in the notes. Refer to the employer only as "our client", "the company", or similar neutral phrasing. This applies to every field you generate -- overview, responsibilities, candidate profile, and compensation/benefits.${
    input.client_name ? ` The client's name is "${input.client_name}" -- this exact name (and close variants of it) must never appear in your output.` : ""
  }

Known facts about this role:
${facts || "(none provided beyond the notes below)"}

Recruiter's rough notes:
${input.raw_notes}

Return ONLY a JSON object (no markdown fence, no commentary) with this exact shape:
{
  "overview": "1-2 sentence intro framed as StaffAnchor hiring on behalf of its client for this role -- no bullet points",
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
      const scrubbed: GeneratedJd = {
        overview: scrubClientName(jd.overview, input.client_name),
        responsibilities: scrubClientName(jd.responsibilities, input.client_name),
        candidate_profile: scrubClientName(jd.candidate_profile, input.client_name),
        compensation_benefits: scrubClientName(jd.compensation_benefits, input.client_name),
      };
      return { ok: true, jd: scrubbed };
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
