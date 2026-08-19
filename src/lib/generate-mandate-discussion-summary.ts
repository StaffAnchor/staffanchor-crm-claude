import { generateTextWithFallback } from "@/lib/ai-providers";

export type MandateDiscussionSummary = {
  mandate_id: string;
  client_name: string;
  role_title: string;
  summary: string;
  tags: string[];
  created_at: string;
};

export type GenerateMandateDiscussionSummaryResult =
  | { ok: true; summary: string; tags: string[] }
  | { ok: false; status: number; error: string };

function parseSummaryJson(raw: string): { summary?: string; tags?: unknown } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as { summary?: string; tags?: unknown };
  } catch {
    // fall through
  }
  return null;
}

/**
 * Turns one screening session's free-text (Tier 2, narrative) answers into
 * a short permanent summary + a handful of searchable tags, stored on the
 * candidate's own profile (mandate_discussion_summaries) rather than left
 * as raw notes attached only to this mandate. This is what makes a single
 * screening call compound into reusable intelligence for every future
 * mandate this candidate is considered for.
 */
export async function generateMandateDiscussionSummary(input: {
  role_title: string;
  client_name: string;
  candidate_name: string;
  qa_pairs: { question: string; answer: string }[];
}): Promise<GenerateMandateDiscussionSummaryResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return { ok: false, status: 503, error: "AI summary generation is not configured (no AI provider API key set)." };
  }
  if (!input.qa_pairs.length) {
    return { ok: false, status: 400, error: "No answers to summarize." };
  }

  const transcript = input.qa_pairs.map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`).join("\n\n");

  const prompt = `You are a sales recruiter's assistant. Below is a screening-call transcript for ${input.candidate_name}, screened against the "${input.role_title}" mandate at ${input.client_name}. Write a short, factual summary a recruiter could re-read in seconds months from now to remember what was actually discussed, plus a handful of short tags capturing concrete, reusable facts about this candidate (not about this mandate) -- e.g. "handled 8-person team", "comfortable with 6-12mo enterprise cycles", "strong objection handling". Refer to the candidate by first name ("${input.candidate_name.split(/\s+/)[0]}") rather than "they/them" -- we don't know gender, and the name reads more naturally.

Transcript:
${transcript}

Return ONLY JSON, no markdown fence:
{"summary": "2-4 sentence factual summary", "tags": ["short tag 1", "short tag 2", ...]}`;

  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    const parsed = parseSummaryJson(raw);
    if (!parsed?.summary) {
      return { ok: false, status: 500, error: "AI summary generation failed. Please try again." };
    }
    const tags = Array.isArray(parsed.tags) ? parsed.tags.map(String).filter(Boolean).slice(0, 8) : [];
    return { ok: true, summary: parsed.summary, tags };
  } catch (err) {
    console.error("mandate-discussion-summary generation failed on every configured AI provider", err);
    const message =
      err instanceof Error && err.message.includes("429")
        ? "All configured AI providers hit their free-tier quota. Try again later."
        : "AI summary generation failed. Please try again.";
    return { ok: false, status: 500, error: message };
  }
}
