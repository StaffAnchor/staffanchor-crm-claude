import { GEMINI_QUALITY_MODELS, generateFromFile, generateTextWithFallback } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";

export type JdFileFields = {
  text: string;
  company_names: string[];
  role_title: string;
  cities: string[];
  experience_min: string;
  experience_max: string;
  budget_min: string;
  budget_max: string;
};

export type JdFileResult = { ok: true; fields: JdFileFields } | { ok: false; status: number; error: string };

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_TEXT = 24000;

const PROMPT = `You are reading a job description that a hiring company sent to a recruitment firm. Return ONLY a JSON object (no markdown fence) with this exact shape:
{
  "text": "the job description as clean plain text, in the original order, without page numbers, headers or footers",
  "company_names": ["the hiring company's name exactly as written, plus any short or brand form used in the document"],
  "role_title": "the job title, or empty string",
  "cities": ["work locations as city names"],
  "experience_min": "minimum years as a number string, or empty",
  "experience_max": "maximum years as a number string, or empty",
  "budget_min": "minimum annual pay in lakhs per annum (LPA) as a number string, or empty",
  "budget_max": "maximum annual pay in lakhs per annum (LPA) as a number string, or empty"
}
Use only what the document says. If something is not stated, use an empty string or empty list. Do not guess.`;

function parse(raw: string): Partial<JdFileFields> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const j = JSON.parse(cleaned);
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, 10) : []);

// Reads a client's JD file (PDF, Word or plain text) and pulls out its text, the hiring company's name(s), and the role's basic
// facts, so the recruiter does not have to retype them. Scanned PDFs and photos are read by the AI directly.
export async function readJdFile(file: File): Promise<JdFileResult> {
  const name = file.name || "jd";
  if (file.size > MAX_BYTES) return { ok: false, status: 413, error: "That file is over 8 MB. Please upload a smaller one." };
  const buffer = await file.arrayBuffer();

  let text: string | null = null;
  if (/\.(txt|md)$/i.test(name) || file.type.startsWith("text/")) text = new TextDecoder().decode(buffer).trim();
  else if (/\.(pdf|docx)$/i.test(name)) text = await extractResumeText(buffer, name);
  else if (/\.doc$/i.test(name)) return { ok: false, status: 415, error: "Old .doc files can't be read. Please save it as .docx or PDF and upload again." };
  else if (!/\.(png|jpe?g|webp)$/i.test(name)) return { ok: false, status: 415, error: "Please upload a PDF, Word (.docx), text file or an image of the JD." };

  let ai: Partial<JdFileFields> | null = null;
  try {
    if (text && text.length >= 40) {
      const { text: raw } = await generateTextWithFallback(`${PROMPT}\n\nDocument:\n${text.slice(0, MAX_TEXT)}`, { json: true, thinkingBudget: 0, geminiModels: GEMINI_QUALITY_MODELS });
      ai = parse(raw);
    } else {
      // No text layer (a scan or a photo): let the AI read the file itself.
      const mimeType = /\.pdf$/i.test(name) ? "application/pdf" : /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "";
      if (!mimeType) return { ok: false, status: 422, error: "That file has no readable text. Paste the JD text instead." };
      const { text: raw } = await generateFromFile(PROMPT, { mimeType, base64: Buffer.from(buffer).toString("base64") }, { json: true, thinkingBudget: 0, geminiModels: GEMINI_QUALITY_MODELS });
      ai = parse(raw);
    }
  } catch (err) {
    console.error("JD file read failed", err);
    if (!text || text.length < 40) return { ok: false, status: 502, error: "Couldn't read that file. Try again, or paste the JD text." };
  }

  const finalText = (str(ai?.text) || text || "").slice(0, MAX_TEXT);
  if (finalText.length < 40) return { ok: false, status: 422, error: "Couldn't find any text in that file. Paste the JD text instead." };
  return {
    ok: true,
    fields: {
      text: finalText,
      company_names: list(ai?.company_names),
      role_title: str(ai?.role_title),
      cities: list(ai?.cities),
      experience_min: str(ai?.experience_min).replace(/[^\d.]/g, ""),
      experience_max: str(ai?.experience_max).replace(/[^\d.]/g, ""),
      budget_min: str(ai?.budget_min).replace(/[^\d.]/g, ""),
      budget_max: str(ai?.budget_max).replace(/[^\d.]/g, ""),
    },
  };
}
