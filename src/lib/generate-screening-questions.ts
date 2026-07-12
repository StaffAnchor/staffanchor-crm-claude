import { GoogleGenerativeAI } from "@google/generative-ai";

export type ScreeningQuestion = {
  id: string;
  text: string;
  source: "ai" | "recruiter";
  // Optional so questions generated before this upgrade (or added manually
  // by a recruiter) still render fine -- the panel treats a missing
  // answer_type as free_text.
  answer_type?: "dropdown" | "multi_select" | "free_text";
  options?: string[];
};

export type GenerateScreeningQuestionsResult =
  | { ok: true; questions: ScreeningQuestion[] }
  | { ok: false; status: number; error: string };

const CATEGORY_LABEL: Record<string, string> = {
  b2b_sales: "B2B Sales",
  b2c_sales: "B2C Sales",
  non_sales: "Non-Sales / Other",
};

type RawQuestion = {
  text?: string;
  answer_type?: string;
  options?: unknown;
};

function parseQuestionsJson(raw: string): RawQuestion[] | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned);
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && Array.isArray((parsed as { questions?: unknown }).questions)
        ? (parsed as { questions: unknown[] }).questions
        : null;
    if (!list) return null;
    // Tolerate the model returning plain strings instead of objects --
    // treat those as free-text questions rather than failing generation.
    return list.map((item) =>
      typeof item === "string" ? { text: item, answer_type: "free_text" } : (item as RawQuestion)
    );
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
  // Added so questions can be conditioned on the mandate's own shape --
  // team-lead situational questions only when this mandate actually
  // involves managing a team, location/relocation questions only when a
  // city is on file, work-arrangement questions when it's not a plain
  // Onsite role.
  team_handling?: string;
  team_size_band?: string;
  work_mode?: string;
  cities?: string[];
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

  const isTeamLead = input.team_handling === "team_lead";

  const facts = [
    `Role title: ${input.role_title}`,
    input.category && `Function / Domain: ${CATEGORY_LABEL[input.category] ?? input.category}`,
    input.sub_domains?.length && `Sub-domain(s): ${input.sub_domains.join(", ")}`,
    input.sales_cycle && `Typical sales cycle for this role: ${input.sales_cycle}`,
    input.deal_size_band && `Typical deal size: ${input.deal_size_band}`,
    input.customer_profile && `Target customer profile: ${input.customer_profile}`,
    input.must_haves?.length && `Must-haves: ${input.must_haves.join("; ")}`,
    input.jd_candidate_profile && `Candidate profile notes: ${input.jd_candidate_profile}`,
    isTeamLead
      ? `This role manages a team${input.team_size_band ? ` of size ${input.team_size_band}` : ""} -- include at least 2 situational team-leadership questions (e.g. handling an underperforming rep, forecasting/coaching approach).`
      : `This role is an individual contributor -- do not ask team-management questions.`,
    input.cities?.length && `Work location(s): ${input.cities.join(", ")} -- include one question probing genuine willingness/logistics for this location if it's not remote.`,
    input.work_mode && input.work_mode !== "Remote" && `Work arrangement: ${input.work_mode}.`,
  ]
    .filter(Boolean)
    .join("\n");

  const prompt = `You are an experienced sales recruiter preparing a targeted screening-call question list for a specific hiring mandate. Use the facts below to write SPECIFIC questions that would actually reveal whether a candidate fits this exact role -- not generic interview questions that could apply to any job.

Mandate facts:
${facts}

Return ONLY a JSON array of 6-8 question objects (no markdown fence, no commentary, no numbering), each shaped exactly like:
{"text": "<the question>", "answer_type": "dropdown" | "multi_select" | "free_text", "options": ["opt1", "opt2", ...]}

Rules:
- Prefer "dropdown" or "multi_select" with 3-6 concrete options whenever the question has a naturally bounded answer (e.g. a range, a style, a yes/no/conditional, a named list of tools or segments) -- this is important, it's what lets the answers become structured, searchable data instead of notes someone has to re-read later.
- Use "free_text" only for genuinely narrative/behavioral questions ("walk me through how you handled...") that can't be reduced to options.
- Every question must probe something specific to this exact role's domain (deal size handled, sales-cycle experience, customer-segment familiarity, team size managed, location fit) -- not generic soft-skill filler.
- options must be omitted or an empty array for free_text questions.`;

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
        .filter((q) => q.text && q.text.trim())
        .map((q) => {
          const answerType: "dropdown" | "multi_select" | "free_text" =
            q.answer_type === "dropdown" || q.answer_type === "multi_select" ? q.answer_type : "free_text";
          const options = Array.isArray(q.options) ? q.options.map(String).filter(Boolean) : [];
          return {
            id: crypto.randomUUID(),
            text: q.text!.trim(),
            source: "ai" as const,
            answer_type: answerType,
            // A dropdown/multi_select with no usable options is worse than
            // free text -- fall back rather than render an empty select.
            options: answerType === "free_text" ? [] : options.length ? options : undefined,
          };
        })
        .map((q) => (q.answer_type !== "free_text" && !q.options?.length ? { ...q, answer_type: "free_text" as const } : q));
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
