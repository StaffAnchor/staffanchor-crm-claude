import { generateTextWithFallback, GEMINI_QUALITY_MODELS } from "@/lib/ai-providers";
import type { CvData } from "../cv-brief/config";
import { allowedAll, allowedForJob, numbersIn } from "./checks";
import type { CvDoc, CvExp } from "./types";

// Rewords the plain draft so it reads like a strong sales CV. The AI only ever sees facts about the work (no name, email, phone
// or link), and its answer is accepted job by job only if it keeps every figure the plain draft had and adds none. Anything
// that fails the check is thrown away and the plain, fully traceable lines stay.

const MAX_LINE = 260;

export type Verdict = { ok: true } | { ok: false; reason: string };

/** Accept a reworded job only if it uses exactly the figures the plain version used: none invented, none dropped. */
export function acceptJob(orig: CvExp, allowed: Set<string>, scope: string, bullets: string[]): Verdict {
  if (!bullets.length || bullets.length > 8) return { ok: false, reason: "wrong number of lines" };
  const lines = [scope, ...bullets].filter(Boolean);
  if (lines.some((l) => l.length > MAX_LINE)) return { ok: false, reason: "a line is too long" };
  const out = new Set(lines.flatMap(numbersIn));
  for (const n of out) if (!allowed.has(n)) return { ok: false, reason: `invented figure ${n}` };
  const before = new Set([orig.scope, ...orig.bullets].flatMap(numbersIn));
  for (const n of before) if (!out.has(n)) return { ok: false, reason: `dropped figure ${n}` };
  return { ok: true };
}

export function acceptSummary(orig: string, allowed: Set<string>, text: string): Verdict {
  if (!text.trim() || text.length > 700) return { ok: false, reason: "summary length" };
  const out = new Set(numbersIn(text));
  for (const n of out) if (!allowed.has(n)) return { ok: false, reason: `invented figure ${n}` };
  for (const n of numbersIn(orig)) if (!out.has(n)) return { ok: false, reason: `dropped figure ${n}` };
  return { ok: true };
}

const RULES = `You polish the wording of a sales CV. You are given facts about each job. Rewrite them as concise, achievement-led CV lines.
Hard rules:
- Use ONLY the facts given. Do not add any number, company, product, customer, skill or claim that is not in the facts.
- Keep every number and its unit exactly as given (for example "₹2.8 Cr" stays "₹2.8 Cr", "88%" stays "88%"). Do not convert, round or recalculate.
- Figures marked team or business must stay worded as the team's or the business's. Never present them as personal results.
- Write without "I" or "my". Start lines with a strong past-tense verb (present tense for a role that is current).
- Each line is one sentence of at most 25 words. At most 6 lines per job. You may merge facts, but keep every figure.
- "scope" is one line saying what the job sold and to whom.
- Do not mention pay. Do not mention anything about career gaps.
Return JSON only: {"summary":"...","jobs":[{"id":"...","scope":"...","bullets":["..."]}]}`;

type Facts = { summary: string; jobs: { id: string; roles: string; current: boolean; scope: string; facts: string[] }[] };

export function factsFor(doc: CvDoc): Facts {
  return {
    summary: doc.summary,
    jobs: doc.experience.map((e) => ({ id: e.id, roles: e.roles.map((r) => r.title).filter(Boolean).join(" then "), current: /present/i.test(e.period), scope: e.scope, facts: e.bullets })),
  };
}

function parseJson(raw: string): { summary?: unknown; jobs?: unknown } | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Returns the draft with reworded lines where they passed the check, and a plain note saying what happened. */
export async function polishDraft(doc: CvDoc, data: CvData): Promise<{ doc: CvDoc; note: string }> {
  if (!doc.experience.length) return { doc, note: "Plain draft only: there were no jobs to reword." };
  let parsed: ReturnType<typeof parseJson> = null;
  try {
    const res = await generateTextWithFallback(`${RULES}\n\nFACTS:\n${JSON.stringify(factsFor(doc))}`, { json: true, thinkingBudget: 0, geminiModels: GEMINI_QUALITY_MODELS });
    parsed = parseJson(res.text);
  } catch (e) {
    console.error("cv polish failed", e);
  }
  if (!parsed) return { doc, note: "Plain draft only: the wording helper did not answer." };

  const next: CvDoc = structuredClone(doc);
  const notes: string[] = [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const sv = acceptSummary(doc.summary, allowedAll(data), summary);
  if (sv.ok) next.summary = summary;
  else notes.push(`summary kept as written (${sv.reason})`);

  let reworded = 0;
  const jobs = Array.isArray(parsed.jobs) ? (parsed.jobs as { id?: unknown; scope?: unknown; bullets?: unknown }[]) : [];
  for (const e of next.experience) {
    const got = jobs.find((j) => j.id === e.id);
    const job = data.jobs.find((j) => j.id === e.id);
    if (!got || !job) continue;
    const bullets = Array.isArray(got.bullets) ? got.bullets.filter((b): b is string => typeof b === "string").map((b) => b.trim()).filter(Boolean) : [];
    const scope = typeof got.scope === "string" ? got.scope.trim() : e.scope;
    const v = acceptJob(e, allowedForJob(job), scope, bullets);
    if (v.ok) {
      e.scope = scope || e.scope;
      e.bullets = bullets;
      reworded++;
    } else notes.push(`${e.company || "a job"} kept as written (${v.reason})`);
  }
  const note = `Wording polished for ${reworded} of ${doc.experience.length} jobs${sv.ok ? " and the summary" : ""}. Every figure was checked against the candidate's answers.${notes.length ? ` ${notes.join("; ")}.` : ""}`;
  return { doc: next, note };
}
