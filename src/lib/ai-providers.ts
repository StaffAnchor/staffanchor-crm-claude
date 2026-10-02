import { GoogleGenerativeAI } from "@google/generative-ai";

// Multi-provider text-generation fallback chain: Gemini -> Groq -> Mistral.
// Every generateContent-style AI call in this app (summaries, matching,
// JD generation, etc.) was a single-provider call, so a Gemini free-tier
// quota exhaustion silently killed the feature (this is what caused 76% of
// candidates to be missing an ai_summary -- see the Aug 2026 AI-health
// investigation). Rather than one provider with 3 model names to retry
// (the old modelsToTry pattern, still tried first here), this tries up to
// 3 SEPARATE PROVIDERS in order -- each with its own independent free-tier
// quota bucket, so one provider's limit being hit doesn't stall the whole
// pipeline. Callers just get back {text, provider, model} instead of
// caring which provider actually served the request.
//
// GROQ_API_KEY / MISTRAL_API_KEY are optional -- if unset, that provider is
// silently skipped (not an error), so this degrades gracefully back to
// Gemini-only behavior on any deploy that hasn't added the extra keys yet.

export type GenerationResult = {
  text: string;
  provider: string;
  model: string;
  // Token counts when the provider reports them (Gemini does), for cost tracking.
  usage?: { inputTokens: number; outputTokens: number };
};

export type GenerationOptions = {
  // Ask Gemini for strict JSON output (no markdown fence) and a low temperature,
  // for extraction work where the same input should give the same answer.
  json?: boolean;
  // Order of Gemini models to try. Defaults to the cheapest-first list; pass a
  // quality-first list for work where accuracy matters more than speed.
  geminiModels?: string[];
};

// For judgment-heavy work (reading a JD or resume and deciding what it means)
// we try the stronger model first and keep the cheap one as a last resort.
export const GEMINI_QUALITY_MODELS = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-2.5-flash-lite"];

// gemini-2.0-flash was shut down (404) -- replaced with gemini-3.6-flash,
// Google's suggested migration target. gemini-2.5-flash-lite/-flash remain
// stable as of Sept 2026, kept as the first two (cheaper/faster) attempts.
const GEMINI_MODELS = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-3.6-flash"];
// llama-3.3-70b-versatile moved to Groq's Enterprise tier (ContactSales,
// not available on a normal developer API key) -- switched to
// openai/gpt-oss-120b, a Production model on Groq's standard developer plan.
const GROQ_MODEL = "openai/gpt-oss-120b";
const MISTRAL_MODEL = "mistral-small-latest";

async function tryGemini(prompt: string, models: string[] = GEMINI_MODELS, json = false): Promise<GenerationResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(json ? { generationConfig: { responseMimeType: "application/json", temperature: 0.1 } } : {}),
      });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      const meta = result.response.usageMetadata;
      if (text) {
        return {
          text,
          provider: "gemini",
          model: modelName,
          // Gemini 2.5 bills its internal "thinking" tokens as output, so count them.
          usage: meta
            ? {
                inputTokens: meta.promptTokenCount ?? 0,
                outputTokens: (meta.candidatesTokenCount ?? 0) + ((meta as { thoughtsTokenCount?: number }).thoughtsTokenCount ?? 0),
              }
            : undefined,
        };
      }
    } catch (err) {
      lastErr = err;
      console.error(`[ai-providers] Gemini failed (${modelName})`, err instanceof Error ? err.message : err);
    }
  }
  if (lastErr) throw lastErr;
  return null;
}

// Gemini-only: reads an attached file (PDF or image) directly, so scanned CVs
// and photos of CVs, which have no text layer, can still be read. Other
// providers here are text-only, so there is no fallback for this path.
export async function generateFromFile(
  prompt: string,
  file: { mimeType: string; base64: string },
  options?: GenerationOptions
): Promise<GenerationResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");
  const genAI = new GoogleGenerativeAI(apiKey);
  const models = options?.geminiModels ?? GEMINI_MODELS;
  let lastErr: unknown = null;
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        ...(options?.json ? { generationConfig: { responseMimeType: "application/json", temperature: 0.1 } } : {}),
      });
      const result = await model.generateContent([{ inlineData: { mimeType: file.mimeType, data: file.base64 } }, { text: prompt }]);
      const text = result.response.text().trim();
      const meta = result.response.usageMetadata;
      if (text) {
        return {
          text,
          provider: "gemini",
          model: modelName,
          usage: meta
            ? {
                inputTokens: meta.promptTokenCount ?? 0,
                outputTokens: (meta.candidatesTokenCount ?? 0) + ((meta as { thoughtsTokenCount?: number }).thoughtsTokenCount ?? 0),
              }
            : undefined,
        };
      }
    } catch (err) {
      lastErr = err;
      console.error(`[ai-providers] Gemini file read failed (${modelName})`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr ?? new Error("Gemini returned no text for the file");
}

async function tryGroq(prompt: string): Promise<GenerationResult | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Groq returned empty content");
    return { text, provider: "groq", model: GROQ_MODEL };
  } catch (err) {
    console.error("[ai-providers] Groq failed", err instanceof Error ? err.message : err);
    throw err;
  }
}

async function tryMistral(prompt: string): Promise<GenerationResult | null> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Mistral ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Mistral returned empty content");
    return { text, provider: "mistral", model: MISTRAL_MODEL };
  } catch (err) {
    console.error("[ai-providers] Mistral failed", err instanceof Error ? err.message : err);
    throw err;
  }
}

/**
 * Generates text from a single prompt, trying Gemini first (3 model
 * fallbacks within Gemini itself, unchanged from before), then Groq, then
 * Mistral -- each a genuinely separate free-tier quota bucket. Throws only
 * if every configured provider failed (or none are configured); the thrown
 * error's message lists which providers were attempted so the caller's
 * error-surfacing logic (e.g. "hit free-tier quota" messaging) can still
 * work, now just naming all attempted providers instead of only Gemini.
 */
export async function generateTextWithFallback(prompt: string, options?: GenerationOptions): Promise<GenerationResult> {
  const attempts: { provider: string; error: string }[] = [];

  const geminiModels = options?.geminiModels;
  for (const [name, fn] of [
    ["gemini", (p: string) => tryGemini(p, geminiModels, options?.json)],
    ["groq", tryGroq],
    ["mistral", tryMistral],
  ] as const) {
    try {
      const result = await fn(prompt);
      if (result) return result;
      // Not configured -- skip silently, don't count as an "attempt".
    } catch (err) {
      attempts.push({ provider: name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  if (attempts.length === 0) {
    throw new Error("No AI provider is configured (set GEMINI_API_KEY, and optionally GROQ_API_KEY / MISTRAL_API_KEY).");
  }
  const summary = attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ");
  throw new Error(`All configured AI providers failed -- ${summary}`);
}
