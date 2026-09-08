import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";

// Reads what the resume/profile actually says and assigns practice(s) +
// seniority band automatically -- the fix for Practice Pool only ever
// covering the ~15% of candidates a recruiter got around to hand-tagging.
// Same reasoning as generateCareerTimelineForCandidate/generateAiPassport:
// this is "memorize every candidate" infrastructure, not a one-off.
//
// Deliberately never overwrites an existing tag (AI or recruiter) -- this
// only fills in candidates/mandates with zero practice_id at all. A
// recruiter correcting or removing an AI-assigned tag via the normal UI is
// final; this classifier doesn't run again for that candidate/mandate
// afterward (see the "zero rows" gate in the sweep query, not in here).

type PracticeOption = { id: string; slug: string; name: string; group_name: string };

const SENIORITY_BANDS = ["ic", "team_lead", "manager", "director", "vp_plus"] as const;

function parseJsonArray(raw: string): unknown[] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray((parsed as { practices?: unknown }).practices)) {
      return (parsed as { practices: unknown[] }).practices;
    }
  } catch {
    // fall through
  }
  return null;
}

function practiceListForPrompt(practices: PracticeOption[]): string {
  return practices.map((p) => `- ${p.slug}: ${p.name} (${p.group_name})`).join("\n");
}

export type ClassifyResult =
  | { ok: true; skipped?: true; reason?: string }
  | { ok: false; error: string };

/**
 * Assigns practice + seniority band tag(s) to a candidate from their resume
 * text (extracting from resume_file_url first if resume_text isn't cached
 * yet, same as the career-timeline generator) plus job title/industry/
 * skills. Writes 1-2 candidate_practices rows with tagged_by='ai'. No-ops
 * if the candidate already has ANY practice row (recruiter or AI) -- never
 * silently re-tags someone a human already looked at.
 */
export async function classifyCandidatePractices(
  candidateId: string,
  supabase: SupabaseClient
): Promise<ClassifyResult> {
  const { count: existingCount } = await supabase
    .from("candidate_practices")
    .select("id", { count: "exact", head: true })
    .eq("candidate_id", candidateId);
  if ((existingCount ?? 0) > 0) return { ok: true, skipped: true, reason: "already tagged" };

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select(
      "id, full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, current_industry, industries, skills, total_experience_years, resume_text, resume_file_url"
    )
    .eq("id", candidateId)
    .single();
  if (error || !candidate) return { ok: false, error: "Candidate not found" };

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
      console.error("Resume text extraction failed during practice classification", err);
    }
  }

  const profileSignal = [
    candidate.current_job_title ? `Current title: ${candidate.current_job_title}` : null,
    candidate.current_employer ? `Current employer: ${candidate.current_employer}` : null,
    candidate.current_industry ? `Current industry: ${candidate.current_industry}` : null,
    Array.isArray(candidate.industries) && candidate.industries.length ? `Industries worked in: ${candidate.industries.join(", ")}` : null,
    candidate.category ? `Function/domain: ${candidate.category}` : null,
    candidate.sub_domain ? `Sub-domain: ${candidate.sub_domain}` : null,
    candidate.skills ? `Skills: ${candidate.skills}` : null,
    typeof candidate.total_experience_years === "number" ? `Total experience: ${candidate.total_experience_years} years` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (!profileSignal && !resumeText?.trim()) return { ok: true, skipped: true, reason: "no signal to classify from" };

  const { data: practicesData } = await supabase.from("practices").select("id, slug, name, group_name").order("sort_order");
  const practices = (practicesData ?? []) as PracticeOption[];
  if (practices.length === 0) return { ok: true, skipped: true, reason: "no practices defined" };

  const prompt = `You are tagging a recruiting candidate into one or more of this firm's sales/functional practices, so recruiters can pitch them to every open role in that practice, not just the one they first applied for.

Candidate profile:
${profileSignal || "(no structured profile fields filled in)"}

${resumeText ? `Resume text (may be long, use what's relevant):\n${resumeText.slice(0, 6000)}` : "(no resume text available)"}

Available practices (use the exact slug):
${practiceListForPrompt(practices)}

Seniority bands: ic (individual contributor), team_lead, manager, director, vp_plus.

Pick 1-2 practices this candidate's actual work history genuinely fits (not just their most recent job title -- consider their whole career). Assign a seniority band per practice based on their level of work in that domain, not just years of experience. If nothing genuinely fits any practice (e.g. a candidate outside sales/functional recruiting entirely, like a designer or engineer with no fit here), return an empty array -- do not force a bad match.

Return ONLY a JSON array, no markdown fence, no commentary:
[{"practice_slug": "...", "seniority_band": "...", "is_primary": true}]`;

  let raw: string;
  try {
    const result = await generateTextWithFallback(prompt);
    raw = result.text;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const parsed = parseJsonArray(raw);
  if (!parsed) return { ok: false, error: "Could not parse AI response as JSON" };

  const rows = parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const obj = item as { practice_slug?: string; seniority_band?: string; is_primary?: boolean };
      const practice = practices.find((p) => p.slug === obj.practice_slug);
      if (!practice) return null;
      if (!obj.seniority_band || !SENIORITY_BANDS.includes(obj.seniority_band as (typeof SENIORITY_BANDS)[number])) return null;
      return { practice_id: practice.id, seniority_band: obj.seniority_band, is_primary: !!obj.is_primary };
    })
    .filter((r): r is { practice_id: string; seniority_band: string; is_primary: boolean } => r !== null)
    .slice(0, 2);

  if (rows.length === 0) return { ok: true, skipped: true, reason: "no genuine practice fit" };

  // Guarantee exactly one primary (model sometimes marks none or several).
  let sawPrimary = false;
  const finalRows = rows.map((r, i) => {
    const isPrimary = !sawPrimary && (r.is_primary || i === rows.length - 1);
    if (isPrimary) sawPrimary = true;
    return { ...r, is_primary: isPrimary };
  });

  const { error: insertError } = await supabase.from("candidate_practices").insert(
    finalRows.map((r) => ({
      candidate_id: candidateId,
      practice_id: r.practice_id,
      seniority_band: r.seniority_band,
      is_primary: r.is_primary,
      tagged_by: "ai",
    }))
  );
  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

/**
 * Same idea for a mandate: classifies a single best-fit practice + seniority
 * band from role_title/job_description. No-ops if practice_id is already
 * set (by anyone, any provenance).
 */
export async function classifyMandatePractice(mandateId: string, supabase: SupabaseClient): Promise<ClassifyResult> {
  const { data: mandate, error } = await supabase
    .from("mandates")
    .select("id, role_title, job_description, practice_id")
    .eq("id", mandateId)
    .single();
  if (error || !mandate) return { ok: false, error: "Mandate not found" };
  if (mandate.practice_id) return { ok: true, skipped: true, reason: "already tagged" };

  const { data: practicesData } = await supabase.from("practices").select("id, slug, name, group_name").order("sort_order");
  const practices = (practicesData ?? []) as PracticeOption[];
  if (practices.length === 0) return { ok: true, skipped: true, reason: "no practices defined" };

  const prompt = `You are tagging an open recruiting mandate (a job requisition) into this firm's sales/functional practice taxonomy, so it shows up in the right recruiters' Practice Pool matching.

Role title: ${mandate.role_title}
${mandate.job_description ? `Job description:\n${(mandate.job_description as string).slice(0, 4000)}` : "(no job description on file)"}

Available practices (use the exact slug):
${practiceListForPrompt(practices)}

Seniority bands: ic, team_lead, manager, director, vp_plus.

Pick the SINGLE best-fit practice for this role. If nothing genuinely fits any practice in the list, return null for practice_slug -- do not force a bad match.

Return ONLY a JSON object, no markdown fence, no commentary:
{"practice_slug": "..." or null, "seniority_band": "..." or null}`;

  let raw: string;
  try {
    const result = await generateTextWithFallback(prompt);
    raw = result.text;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: { practice_slug?: string | null; seniority_band?: string | null } | null = null;
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object") parsed = obj;
  } catch {
    return { ok: false, error: "Could not parse AI response as JSON" };
  }
  if (!parsed || !parsed.practice_slug) return { ok: true, skipped: true, reason: "no genuine practice fit" };

  const practice = practices.find((p) => p.slug === parsed!.practice_slug);
  if (!practice) return { ok: true, skipped: true, reason: "model returned an unknown practice slug" };

  const seniorityBand =
    parsed.seniority_band && SENIORITY_BANDS.includes(parsed.seniority_band as (typeof SENIORITY_BANDS)[number])
      ? parsed.seniority_band
      : null;

  const { error: updateError } = await supabase
    .from("mandates")
    .update({ practice_id: practice.id, seniority_band: seniorityBand, practice_tagged_by: "ai" })
    .eq("id", mandateId)
    .is("practice_id", null); // race-safe: only write if still unset
  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true };
}
