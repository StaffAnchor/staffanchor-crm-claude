import { GEMINI_QUALITY_MODELS, generateTextWithFallback } from "@/lib/ai-providers";
import { logAiUsage } from "@/lib/ai-usage";

// Drafts the must-have / good-to-have lists for a role from the JD the
// recruiter already wrote. It only ever suggests: nothing is saved until a
// person reviews and confirms it in the panel. The lists matter because the
// matcher treats an empty list as "everything is met", which makes every
// candidate look like a strong fit.

export const MAX_MUST_HAVES = 6;
export const MAX_GOOD_TO_HAVES = 6;
const MAX_ITEM_CHARS = 110;

export type SpecItem = { text: string; source: string };

export type RoleSpecDraft = {
  mustHaves: SpecItem[];
  goodToHaves: SpecItem[];
  questionsForClient: string[];
};

export type DraftRoleSpecResult = { ok: true; draft: RoleSpecDraft } | { ok: false; status: number; error: string };

export type RoleForSpec = {
  id: string;
  role_title: string | null;
  category: string | null;
  sub_domains: string[] | null;
  cities: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  budget_min: number | null;
  budget_max: number | null;
  job_description: string | null;
  jd_overview: string | null;
  jd_responsibilities: unknown;
  jd_candidate_profile: unknown;
  jd_compensation_benefits: unknown;
  notes: string | null;
};

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).map((x) => `- ${x}`).join("\n");
  return "";
}

export function roleHasJdText(r: RoleForSpec): boolean {
  return [r.job_description, r.jd_overview, r.jd_responsibilities, r.jd_candidate_profile].some((v) => asText(v).length > 0);
}

function cleanItems(raw: unknown, max: number, exclude: Set<string>): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(exclude);
  const out: SpecItem[] = [];
  for (const entry of raw) {
    const text = typeof entry === "string" ? entry : typeof entry?.text === "string" ? entry.text : "";
    const source = typeof entry?.source === "string" ? entry.source : "";
    const t = text.trim().replace(/\s+/g, " ").replace(/[.;]$/, "");
    if (!t || t.length > MAX_ITEM_CHARS) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t, source: source.trim().slice(0, 160) });
    if (out.length >= max) break;
  }
  return out;
}

export function parseRoleSpecJson(raw: string): RoleSpecDraft | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") return null;
    const mustHaves = cleanItems(parsed.must_haves, MAX_MUST_HAVES, new Set());
    // A requirement can't be both; keep it as a must-have.
    const goodToHaves = cleanItems(parsed.good_to_haves, MAX_GOOD_TO_HAVES, new Set(mustHaves.map((m) => m.text.toLowerCase())));
    const questionsForClient = Array.isArray(parsed.questions_for_client)
      ? parsed.questions_for_client
          .filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
          .map((q: string) => q.trim().slice(0, 200))
          .slice(0, 3)
      : [];
    if (mustHaves.length === 0 && goodToHaves.length === 0) return null;
    return { mustHaves, goodToHaves, questionsForClient };
  } catch {
    return null;
  }
}

export function buildRoleSpecPrompt(r: RoleForSpec): string {
  const facts = [
    r.role_title && `Role title: ${r.role_title}`,
    r.category && `Function: ${r.category}`,
    r.sub_domains?.length && `Sub-domains: ${r.sub_domains.join(", ")}`,
    r.cities?.length && `Locations: ${r.cities.join(", ")}`,
    (r.experience_min != null || r.experience_max != null) && `Experience: ${r.experience_min ?? "?"}-${r.experience_max ?? "?"} years`,
    (r.budget_min != null || r.budget_max != null) && `Budget: ${r.budget_min ?? "?"}-${r.budget_max ?? "?"} LPA`,
  ]
    .filter(Boolean)
    .join("\n");

  const sections = [
    ["Full job description", asText(r.job_description)],
    ["Overview", asText(r.jd_overview)],
    ["Responsibilities", asText(r.jd_responsibilities)],
    ["Candidate profile", asText(r.jd_candidate_profile)],
    ["Compensation and benefits", asText(r.jd_compensation_benefits)],
    ["Recruiter notes", asText(r.notes)],
  ]
    .filter(([, body]) => body)
    .map(([title, body]) => `${title}:\n${body}`)
    .join("\n\n");

  return `You are a senior recruiter at StaffAnchor, a specialist firm hiring revenue (sales) professionals. Turn the role below into a short checklist a recruiter can verify from a candidate's resume or a quick call.

Rules:
- must_haves: hard requirements. A candidate who clearly lacks one should NOT be submitted. At most ${MAX_MUST_HAVES}. Prefer fewer, sharper ones.
- good_to_haves: nice extras that raise a candidate's rank but never disqualify. At most ${MAX_GOOD_TO_HAVES}.
- Every item must be short (under 12 words), specific and checkable from a resume. Good: "Sold B2B SaaS to mid-market or enterprise", "3+ years in field sales", "Managed a team of 5 or more", "Based in or willing to relocate to Pune". Bad: "good communication", "team player", "passionate", "self-motivated".
- Use ONLY what the role text says or clearly implies. Never invent a requirement the client did not ask for. If the role text is thin, return fewer items.
- For each item give "source": the short phrase or section of the role text it comes from.
- questions_for_client: up to 3 important things the text leaves unclear that would change who you shortlist (for example deal size, sales cycle, quota, industry preference, notice period tolerance). Skip this if nothing important is missing.

Role facts:
${facts || "(none)"}

${sections}

Return ONLY a JSON object (no markdown fence, no commentary):
{
  "must_haves": [{"text": "...", "source": "..."}],
  "good_to_haves": [{"text": "...", "source": "..."}],
  "questions_for_client": ["..."]
}`;
}

export async function draftRoleSpec(role: RoleForSpec): Promise<DraftRoleSpecResult> {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return { ok: false, status: 503, error: "AI isn't configured yet (no AI provider key set on the server)." };
  }
  if (!roleHasJdText(role)) {
    return { ok: false, status: 400, error: "Add the job description first. The draft is built from it." };
  }

  try {
    const result = await generateTextWithFallback(buildRoleSpecPrompt(role), { geminiModels: GEMINI_QUALITY_MODELS });
    const draft = parseRoleSpecJson(result.text);
    await logAiUsage({ purpose: "role_spec_draft", refType: "mandate", refId: role.id, result, error: draft ? undefined : "unparseable response" });
    if (!draft) return { ok: false, status: 502, error: "The AI response couldn't be read. Try again." };
    return { ok: true, draft };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAiUsage({ purpose: "role_spec_draft", refType: "mandate", refId: role.id, error: message });
    console.error("[draft-role-spec] failed", message);
    return {
      ok: false,
      status: 502,
      error: message.includes("429") ? "The AI is at its usage limit right now. Try again in a few minutes." : "The AI couldn't draft this just now. Try again.",
    };
  }
}
