import { generateTextWithFallback } from "@/lib/ai-providers";
import { parseCtcLakhs, parseExperienceYears, parseLocation, parseNoticePeriod } from "@/lib/whatsapp-bot/parse";

const LABEL: Record<string, string> = {
  current_fixed_ctc: "Current CTC",
  expected_fixed_ctc: "Expected CTC",
  notice_period: "Notice period",
  total_experience_years: "Experience",
  current_location: "City",
  current_employer: "Current company",
  current_job_title: "Current role",
};

/**
 * Reads a free-text reply ("12 LPA, 16 LPA, 30 days") into profile fields. The AI only says which words
 * answer which question; every value then goes through the same strict readers the WhatsApp assistant
 * uses, so a misread never lands on a profile. Returns only the fields that were clearly answered.
 */
export async function readReplyFields(reply: string, wanted: string[]): Promise<Record<string, number | string>> {
  const keys = wanted.filter((k) => LABEL[k]);
  if (keys.length === 0 || !reply.trim()) return {};
  const questions = keys.map((k, i) => `${i + 1}. ${k} (${LABEL[k]})`).join("\n");
  const prompt = `A recruiter asked a candidate for these details:\n${questions}\n\nThe candidate replied by email:\n"""${reply.slice(0, 1500)}"""\n\nReturn ONLY a JSON object whose keys are among the field names above. For each field the candidate clearly answered, give the candidate's own words for it as a short string (for example "12 LPA" or "30 days"). If they answered in order without labels, match answers to the questions in order. Leave out anything not clearly answered. Never guess or calculate.`;
  const raw: Record<string, string> = {};
  try {
    const { text } = await generateTextWithFallback(prompt, { json: true, thinkingBudget: 256 });
    const parsed = JSON.parse(text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()) as Record<string, unknown>;
    for (const k of keys) if (typeof parsed[k] === "string" || typeof parsed[k] === "number") raw[k] = String(parsed[k]).trim();
  } catch {
    return {};
  }
  const clean: Record<string, number | string> = {};
  for (const k of keys) {
    const v = raw[k];
    if (!v) continue;
    let out: number | string | null = null;
    if (k === "current_fixed_ctc") out = parseCtcLakhs(v, { allowZero: true });
    else if (k === "expected_fixed_ctc") out = parseCtcLakhs(v);
    else if (k === "notice_period") out = parseNoticePeriod(v);
    else if (k === "total_experience_years") out = parseExperienceYears(v);
    else if (k === "current_location") out = parseLocation(v);
    else if (k === "current_employer" || k === "current_job_title") out = v.length >= 2 && v.length <= 80 && !v.includes("?") ? v : null;
    if (out !== null && out !== undefined) clean[k] = out;
  }
  return clean;
}

/** The new text of an email reply: everything above the quoted history and the signature line. */
export function newTextOf(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^>/.test(t)) break;
    if (/^(on .{5,120} wrote:?|-{2,}\s*original message|from:\s.+|sent from my )/i.test(t)) break;
    out.push(line);
  }
  return out.join("\n").trim().slice(0, 2000);
}
