import { generateTextWithFallback } from "@/lib/ai-providers";
import { COVERED_BY_BASICS, basicApplicationQuestions, type ApplyContext, type ApplyType, type GeneratedQuestion } from "@/lib/application-questions";

const MAX_JD_QUESTIONS = 3;

type Raw = { text?: unknown; answer_type?: unknown };

function parse(raw: string): Raw[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray((parsed as { questions?: unknown }).questions) ? (parsed as { questions: unknown[] }).questions : null;
    return list ? list.map((x) => (typeof x === "string" ? { text: x, answer_type: "yes_no" } : (x as Raw))) : null;
  } catch {
    return null;
  }
}

/**
 * The questions to put in front of someone applying: the basics always, then at most three simple ones from the job description.
 * If the AI is unavailable the basics still come back, so generating never leaves a role with nothing.
 */
export async function generateApplicationQuestions(ctx: ApplyContext): Promise<{ questions: GeneratedQuestion[]; aiUsed: boolean; note: string | null }> {
  const basics = basicApplicationQuestions(ctx);
  const aiConfigured = !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY);
  const must = (ctx.must_haves ?? []).filter(Boolean);
  if (!aiConfigured) return { questions: basics, aiUsed: false, note: "AI is not set up on the server, so only the basic questions were added." };
  if (must.length === 0 && !ctx.jd_overview && !ctx.jd_candidate_profile) return { questions: basics, aiUsed: false, note: "This role has no must-haves or job description yet, so only the basic questions were added." };

  const facts = [
    `Role: ${ctx.role_title}`,
    ctx.category && `Function: ${ctx.category}`,
    ctx.sub_domains?.length && `Area: ${ctx.sub_domains.join(", ")}`,
    must.length && `Must-haves: ${must.join("; ")}`,
    ctx.good_to_haves?.length && `Good to have: ${ctx.good_to_haves.join("; ")}`,
    ctx.jd_candidate_profile && `Who we want: ${ctx.jd_candidate_profile.slice(0, 600)}`,
    ctx.jd_overview && `About the role: ${ctx.jd_overview.slice(0, 600)}`,
    ctx.sales_cycle && `Sales cycle: ${ctx.sales_cycle}`,
    ctx.deal_size_band && `Deal size: ${ctx.deal_size_band}`,
  ].filter(Boolean).join("\n");

  const prompt = `You write the short questions a job seeker answers on their phone while applying for a role. The goal is that people finish the form, so every question must feel quick, friendly and easy.

${facts}

Write ${MAX_JD_QUESTIONS} questions at most, taken from the must-haves above (the most important ones first).

Rules:
- Plain everyday words, one short line, answerable in about ten seconds. No jargon, no long scenarios, no "describe" or "explain" questions.
- Prefer "yes_no" ("Have you sold ...?"). Use "numeric" for a count such as years or team size ("How many years have you ...?"). Use "short_answer" only if nothing else works, and keep it to a few words.
- Never ask about pay, notice period or joining date, work location, relocation, working days, or whether they are working now: those are asked already.
- Never ask for anything personal or sensitive. Do not make the person feel judged.

Return ONLY a JSON array, no commentary: [{"text": "...", "answer_type": "yes_no" | "numeric" | "short_answer"}]`;

  try {
    const { text } = await generateTextWithFallback(prompt);
    const list = parse(text);
    if (!list) return { questions: basics, aiUsed: false, note: "The AI answer could not be read, so only the basic questions were added. Try again." };
    const jd: GeneratedQuestion[] = [];
    for (const r of list) {
      const t = typeof r.text === "string" ? r.text.trim() : "";
      if (t.length < 8 || t.length > 160 || COVERED_BY_BASICS.test(t)) continue;
      const type: ApplyType = r.answer_type === "numeric" ? "numeric" : r.answer_type === "short_answer" ? "short_answer" : "yes_no";
      jd.push({ question_text: t, answer_type: type, is_required: false, kind: "jd" });
      if (jd.length >= MAX_JD_QUESTIONS) break;
    }
    return { questions: [...basics, ...jd], aiUsed: true, note: null };
  } catch (e) {
    console.error("application question generation failed", e);
    return { questions: basics, aiUsed: false, note: "The AI could not be reached, so only the basic questions were added. Try again." };
  }
}
