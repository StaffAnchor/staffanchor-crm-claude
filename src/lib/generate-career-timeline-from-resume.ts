import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractResumeText } from "@/lib/resume-text";
import type { ResumeTimelineEntry, ProfileTimelineEntry } from "@/lib/career-timeline";
import { mergeTimelines, computeStabilityScore, computeDomainConsistencyScore } from "@/lib/career-timeline";

export type GenerateCareerTimelineResult =
  | { ok: true; skipped?: true; entries?: ResumeTimelineEntry[] }
  | { ok: false; status: number; error: string };

function parseEntriesJson(raw: string): unknown[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray((parsed as { entries?: unknown }).entries)) {
      return (parsed as { entries: unknown[] }).entries;
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Extracts a career timeline from a candidate's resume text, whether or not
 * they've ever touched the profile builder -- this is what makes Stability
 * Score possible for a thin quick-apply or recruiter-seeded candidate who
 * only ever uploaded a resume. Regeneration is skipped (via a hash of the
 * resume text, career_timeline_resume_source_hash) whenever the resume
 * hasn't actually changed since the last run, so this is safe to call
 * repeatedly from a cron sweep.
 */
export async function generateCareerTimelineForCandidate(
  candidateId: string,
  supabase: SupabaseClient
): Promise<GenerateCareerTimelineResult> {
  const { data: candidate, error } = await supabase
    .from("candidates")
    .select("resume_text, resume_file_url, career_timeline_resume_source_hash, career_timeline_profile")
    .eq("id", candidateId)
    .single();
  if (error || !candidate) return { ok: false, status: 404, error: "Candidate not found" };

  let resumeText = candidate.resume_text as string | null;
  if (!resumeText && candidate.resume_file_url) {
    try {
      const cleanPath = (candidate.resume_file_url as string).replace(/^resumes\//, "");
      const { data: signed } = await supabase.storage.from("resumes").createSignedUrl(cleanPath, 300);
      if (signed?.signedUrl) {
        const fileRes = await fetch(signed.signedUrl);
        const buffer = await fileRes.arrayBuffer();
        const extracted = await extractResumeText(buffer, cleanPath);
        if (extracted) {
          resumeText = extracted;
          await supabase.from("candidates").update({ resume_text: extracted }).eq("id", candidateId);
        }
      }
    } catch (err) {
      console.error("Resume text extraction failed during career-timeline generation", err);
    }
  }

  if (!resumeText?.trim()) return { ok: true, skipped: true };

  const hash = crypto.createHash("md5").update(resumeText).digest("hex");
  if (hash === candidate.career_timeline_resume_source_hash) return { ok: true, skipped: true };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "GEMINI_API_KEY not configured" };

  const prompt = `Extract this candidate's employment history from the resume text below. Return ONLY a JSON array (no markdown fence, no commentary), one object per job, most recent first, shaped exactly like:
{"company": "...", "title": "...", "start_month": "YYYY-MM" | null, "end_month": "YYYY-MM" | null, "description": "one short sentence on what they did/sold, or empty string"}

Rules:
- end_month is null if this is their current/ongoing role.
- If you can't confidently determine a month, use "01" for that month rather than omitting the date entirely -- an approximate date is more useful than none for tenure calculations.
- Skip education entries, certifications, and anything that isn't an employer.
- If no employment history is identifiable, return [].

Resume text:
${resumeText.slice(0, 12000)}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const list = parseEntriesJson(raw);
      if (!list) {
        lastError = new Error("Model response was not valid JSON.");
        continue;
      }
      const entries: ResumeTimelineEntry[] = list
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .filter((e) => typeof e.company === "string" && e.company.trim())
        .map((e) => ({
          id: crypto.randomUUID(),
          company: String(e.company).trim(),
          title: typeof e.title === "string" ? e.title.trim() : "",
          start_month: typeof e.start_month === "string" ? e.start_month : null,
          end_month: typeof e.end_month === "string" ? e.end_month : null,
          description: typeof e.description === "string" ? e.description : "",
        }));

      const scores = computeScores(entries, (candidate.career_timeline_profile as ProfileTimelineEntry[]) ?? []);
      await supabase
        .from("candidates")
        .update({
          career_timeline_resume: entries,
          career_timeline_resume_generated_at: new Date().toISOString(),
          career_timeline_resume_source_hash: hash,
          stability_score: scores.stability,
          domain_consistency_score: scores.domainConsistency,
        })
        .eq("id", candidateId);

      return { ok: true, entries };
    } catch (err) {
      lastError = err;
      console.error(`Gemini career-timeline extraction failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota. Generate a fresh key at aistudio.google.com/apikey or enable billing."
      : "Career timeline extraction failed.";
  return { ok: false, status: 500, error: message };
}

/** Shared by both the resume-extraction path and the manual-profile-edit save path, so the stored scores never drift out of sync with whichever array changed most recently. */
export function computeScores(
  resumeEntries: ResumeTimelineEntry[],
  profileEntries: ProfileTimelineEntry[]
): { stability: number | null; domainConsistency: number | null } {
  const merged = mergeTimelines(profileEntries, resumeEntries);
  const stability = computeStabilityScore(merged);
  const domainConsistency = computeDomainConsistencyScore(profileEntries);
  return {
    stability: stability?.score ?? null,
    domainConsistency: domainConsistency?.score ?? null,
  };
}
