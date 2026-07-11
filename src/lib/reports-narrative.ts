import { GoogleGenerativeAI } from "@google/generative-ai";

export type ReportsNarrativeInput = {
  rangeLabel: string;
  totalCandidates: number;
  inflowTotal: number;
  inflowDeltaPct: number | null;
  topDomain: { label: string; pct: number } | null;
  topCategory: { label: string; pct: number } | null;
  topRecruiter: { name: string; placed: number } | null;
  totalPlaced: number;
  attentionSignals: { label: string; value: number }[];
};

export type ReportsNarrativeResult =
  | { ok: true; narrative: string }
  | { ok: false; status: number; error: string };

/**
 * One-to-two sentence executive summary sitting above the Reports KPI
 * strip -- synthesizes the same numbers already on the page (domain/
 * category mix, inflow delta, top recruiter, attention signals) into a
 * story a sharp analyst would say out loud, rather than making the reader
 * piece it together from six separate charts themselves.
 */
export async function generateReportsNarrative(input: ReportsNarrativeInput): Promise<ReportsNarrativeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "AI narrative is not configured yet (missing GEMINI_API_KEY on the server).",
    };
  }

  const prompt = `You are a sharp recruiting-ops analyst writing a one-to-two sentence executive summary for a hiring-agency Reports dashboard. Use ONLY the facts given below -- never invent numbers or trends not present in the data. Reference the reporting period ("${input.rangeLabel}") naturally, but don't just restate every number back -- synthesize the story (what's working, what's slowing down, what needs attention), the way a sharp analyst would say it out loud in a stand-up. Max 2 sentences, no markdown, no preamble, no bullet points.

Data (JSON):
${JSON.stringify(input, null, 2)}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const narrative = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      if (narrative) return { ok: true, narrative };
    } catch (err) {
      lastError = err;
      console.error(`Gemini reports narrative failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has hit its free-tier quota. Try again later."
      : "Couldn't generate an AI narrative. Please try again.";
  return { ok: false, status: 500, error: message };
}
