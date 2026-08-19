import { generateTextWithFallback } from "@/lib/ai-providers";

export type InboxInsightInput = {
  taskType: string;
  title: string;
  detail: string | null;
  priority: string;
  candidateName: string | null;
  mandateRoleTitle: string | null;
  mandateClientName: string | null;
};

export type InboxInsightResult =
  | { ok: true; insight: string }
  | { ok: false; status: number; error: string };

/**
 * One-sentence "why this matters + what to do" for a single Priority
 * Actions inbox item. Generated on demand (not persisted, not swept by a
 * cron) -- the underlying task is already rule-computed; this just adds a
 * sharper, situation-specific gloss on top of it, the same way ai-passport.ts
 * adds a written summary on top of structured candidate fields.
 */
export async function generateInboxInsight(input: InboxInsightInput): Promise<InboxInsightResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return {
      ok: false,
      status: 503,
      error: "AI insight is not configured yet (no AI provider API key set on the server).",
    };
  }

  const prompt = `You are a sharp recruiting-ops assistant. A recruiter is looking at one task in their Priority Actions inbox. Using ONLY the facts given below, write ONE short sentence (max ~22 words) explaining why this specific task matters right now and what the recruiter should do next. Be concrete and specific to the facts given -- never generic filler like "this is important, please follow up." No preamble, no markdown fence, just the sentence.

Task type: ${input.taskType}
Title: ${input.title}
Detail: ${input.detail ?? "(none)"}
Priority: ${input.priority}
Candidate: ${input.candidateName ?? "(none)"}
Mandate: ${
    input.mandateRoleTitle
      ? `${input.mandateRoleTitle}${input.mandateClientName ? ` at ${input.mandateClientName}` : ""}`
      : "(none)"
  }`;

  try {
    const { text: raw } = await generateTextWithFallback(prompt);
    const insight = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (insight) return { ok: true, insight };
    return { ok: false, status: 500, error: "Couldn't generate an AI insight. Please try again." };
  } catch (err) {
    console.error("Inbox insight failed on every configured AI provider", err);
    const message =
      err instanceof Error && err.message.includes("429")
        ? "All configured AI providers hit their free-tier quota. Try again later."
        : "Couldn't generate an AI insight. Please try again.";
    return { ok: false, status: 500, error: message };
  }
}
