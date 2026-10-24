import { GoogleGenerativeAI, type Content, type FunctionCall, type Part, type UsageMetadata } from "@google/generative-ai";
import { assertAiNotPaused } from "@/lib/ai-switch";
import { logAiUsage } from "@/lib/ai-usage";
import { systemPrompt } from "./prompt";
import { loadHistory, saveContents } from "./store";
import { proposeTools } from "./tools-propose";
import { readTools, type Tool } from "./tools-read";
import type { Ctx } from "./types";

// One turn of the assistant: the admin's message goes to Gemini together with the tools; whenever Gemini asks for a tool the CRM
// runs it and hands back the result, until Gemini answers in words. Proposals made along the way are cards, never actions.

const TOOLS: Tool[] = [...readTools, ...proposeTools];
const BY_NAME = new Map(TOOLS.map((t) => [t.decl.name, t]));
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const MAX_STEPS = 8;
const DEADLINE_MS = 100_000;
const MAX_RESULT_CHARS = 24_000;

/** A tool result as something the model can read: always an object, and never so long it floods the conversation. */
export const ALL_TOOLS = TOOLS;

export function forModel(value: unknown): Record<string, unknown> {
  let s = JSON.stringify(value ?? null, (_k, v) => (Array.isArray(v) && v.length > 15 ? [...v.slice(0, 15), `... and ${v.length - 15} more`] : v)) ?? "null";
  if (s.length > MAX_RESULT_CHARS) s = JSON.stringify({ truncated: true, start: s.slice(0, MAX_RESULT_CHARS) });
  return { output: JSON.parse(s) };
}

/** The small part of a chat the loop needs, so a test can stand in for Gemini. */
export type ChatLike = {
  sendMessage(parts: string | Part[]): Promise<{ response: { functionCalls(): FunctionCall[] | undefined; text(): string; usageMetadata?: UsageMetadata } }>;
  getHistory(): Promise<Content[]>;
};
export type Deps = { makeChat?: (modelName: string, history: Content[]) => ChatLike };

export async function runAgent(ctx: Ctx, userText: string, deps: Deps = {}): Promise<void> {
  const started = Date.now();
  await assertAiNotPaused();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey && !deps.makeChat) throw new Error("GEMINI_API_KEY is not configured.");
  const genAI = new GoogleGenerativeAI(apiKey ?? "unused");
  const history = await loadHistory(ctx.admin, ctx.threadId);
  // The admin's message is saved first, so cards the assistant makes along the way appear after it in the saved conversation.
  await saveContents(ctx.admin, ctx.threadId, [{ role: "user", parts: [{ text: userText }] }]);

  let lastError: unknown = null;
  for (const modelName of MODELS) {
    // Once a tool has run, a second model must not start over: it could create the same proposal twice.
    let ran = false;
    try {
      const chat: ChatLike = deps.makeChat
        ? deps.makeChat(modelName, history)
        : genAI
            .getGenerativeModel({
              model: modelName,
              systemInstruction: systemPrompt(),
              tools: [{ functionDeclarations: TOOLS.map((t) => t.decl) }],
              generationConfig: { temperature: 0.2, thinkingConfig: { thinkingBudget: 512 } } as never,
            })
            .startChat({ history });
      const send = async (parts: string | Part[]) => {
        const res = await chat.sendMessage(parts);
        const u = res.response.usageMetadata;
        void logAiUsage({ purpose: "agent_chat", refType: "agent_thread", refId: ctx.threadId, result: { text: "", provider: "gemini", model: modelName, usage: u ? { inputTokens: u.promptTokenCount ?? 0, outputTokens: (u.candidatesTokenCount ?? 0) + ((u as { thoughtsTokenCount?: number }).thoughtsTokenCount ?? 0) } : undefined } });
        return res;
      };

      let res = await send(userText);
      for (let step = 0; step < MAX_STEPS; step++) {
        const calls = res.response.functionCalls();
        if (!calls || calls.length === 0) break;
        if (Date.now() - started > DEADLINE_MS) break;
        const answers: Part[] = [];
        for (const call of calls) {
          const tool = BY_NAME.get(call.name);
          ctx.emit({ t: "status", text: tool?.status ?? call.name });
          ran = true;
          let out: unknown;
          try {
            out = tool ? await tool.run((call.args ?? {}) as Record<string, unknown>, ctx) : { error: `There is no tool called ${call.name}.` };
          } catch (e) {
            console.error(`[agent] tool ${call.name} failed`, e);
            out = { error: e instanceof Error ? e.message : "The tool failed." };
          }
          answers.push({ functionResponse: { name: call.name, response: forModel(out) } });
        }
        res = await send(answers);
      }

      let text = "";
      try {
        text = res.response.text().trim();
      } catch {
        text = "";
      }
      const finalText = text || "I looked into that but could not put an answer together. Try asking again, a little more specifically.";
      ctx.emit({ t: "text", text: finalText });

      const full: Content[] = await chat.getHistory();
      await saveContents(ctx.admin, ctx.threadId, full.slice(history.length + 1));
      return;
    } catch (e) {
      lastError = e;
      if (ran) break;
      console.error(`[agent] ${modelName} failed`, e instanceof Error ? e.message : e);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The assistant could not reach the AI.");
}
