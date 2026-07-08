import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractResumeText } from "@/lib/resume-text";

type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  resume_highlights?: string[];
};

function parsePassportJson(raw: string): AiPassport | null {
  // Gemini sometimes wraps JSON in a ```json fence despite instructions not to.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as AiPassport;
  } catch {
    // fall through
  }
  return null;
}

function passportToSummary(p: AiPassport): string {
  return [p.headline, p.compensation_line, p.targets_line].filter(Boolean).join(" ");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const { candidateId } = await req.json();
  if (!candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select(
      "full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, notice_period, current_fixed_ctc, current_variable_ctc, expected_fixed_ctc, skills, industries, segment_data, self_assessment, recruiter_assessment, resume_file_url, resume_text"
    )
    .eq("id", candidateId)
    .single();

  if (error || !candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI summary is not configured yet (missing GEMINI_API_KEY on the server)." },
      { status: 503 }
    );
  }

  // Resume text is cached on the candidate row after first extraction so we
  // don't re-download and re-parse the file every time a summary is regenerated.
  let resumeText = candidate.resume_text as string | null;
  if (!resumeText && candidate.resume_file_url) {
    try {
      const rawPath = candidate.resume_file_url as string;
      const cleanPath = rawPath.replace(/^resumes\//, "");
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
      console.error("Resume text extraction failed during summary generation", err);
    }
  }

  // Truncate to keep prompt size/cost sane -- a few pages of resume text is
  // plenty for pulling out achievements/employers, we don't need the whole thing.
  const resumeExcerpt = resumeText ? resumeText.slice(0, 8000) : null;

  const factSheet = {
    name: candidate.full_name,
    current_role: candidate.current_job_title,
    current_employer: candidate.current_employer,
    category: candidate.category,
    primary_sub_domain: candidate.sub_domain,
    secondary_sub_domains: candidate.secondary_sub_domains,
    total_experience_years: candidate.total_experience_years,
    location: candidate.current_location,
    notice_period: candidate.notice_period,
    current_fixed_ctc_lakhs: candidate.current_fixed_ctc,
    current_variable_ctc_lakhs: candidate.current_variable_ctc,
    expected_fixed_ctc_lakhs: candidate.expected_fixed_ctc,
    skills: candidate.skills,
    industries_worked_in: candidate.industries,
    self_reported_segment_data: candidate.segment_data,
    self_assessment_writeups: candidate.self_assessment,
    recruiter_scorecard: candidate.recruiter_assessment,
  };

  const firstName = (candidate.full_name as string | null)?.trim().split(/\s+/)[0] ?? "This candidate";

  const prompt = `You are helping a recruiter write a concise, natural-sounding candidate passport for a sales-hiring CRM. This is shown to both recruiters and clients deciding whether to interview someone. It must read like a person wrote it, not like a data dump.

Use ONLY facts given below (structured data + resume excerpt) -- never invent employers, numbers, skills, or achievements that are not present. If the structured data and resume excerpt conflict, trust the structured data. If a field is missing, omit it rather than guessing.

Writing rules -- these matter as much as the facts:
1. Use the candidate's first name ("${firstName}") only in the headline. Every sentence after that must use "they/their" instead of repeating the full name -- never write the full name more than once across the whole passport.
2. Never just list raw numbers back-to-back. Synthesize. For achievement history specifically: don't dump every percentage range as a comma list -- describe the pattern instead, e.g. "consistently hitting 90%+ of target in 3 of the last 4 quarters, with one softer stretch at 50-75%" rather than "86-90%, 96-100%, 96-100%, and 50-75%".
3. Each line should read as something a sharp recruiter would actually say out loud about this candidate, not a form filled in with data. Vary sentence structure across the three lines instead of repeating the same "X is Y" pattern each time.
4. Keep every line to one sentence, tight and specific -- no filler like "is a great fit" or "has strong experience" without a fact backing it up.

Return ONLY a JSON object (no markdown fence, no commentary) with exactly these keys:
- "headline": one sentence -- ${firstName}'s current role/employer and primary sales domain, using their actual name once here.
- "compensation_line": one sentence weaving together current and expected fixed CTC (and variable, if present) -- e.g. frame it as what they're looking for, not just "CTC is X". Omit key entirely if no CTC data exists.
- "targets_line": one sentence synthesizing quota/target performance into a pattern or trend (see rule 2 above). Where the underlying fields are present in segment data, work in the actual target size (e.g. "ic_targets"/quarterly or period target amount, with its currency) and typical deal size ("deal_size" band, with its currency) alongside the achievement trend -- don't just report the achievement percentages in isolation when the target amount and deal size are sitting right there in the data. Omit key entirely if no target/achievement data exists at all.
- Note on "best"/"lost" self-assessment write-ups: these are the candidate's own words about a specific win/loss, not resume content. If used, fold the concrete fact (e.g. a named client or deal size mentioned there) into "targets_line" rather than "resume_highlights", since "resume_highlights" is reserved for facts pulled from the actual resume excerpt below.
- "resume_highlights": an array of 2-4 short bullet-point strings pulled from the resume excerpt below -- concrete, factual points only (notable employers/clients, tenure pattern, certifications, named achievements) that AREN'T already covered by the headline/compensation/targets lines. Omit key (or return empty array) if no resume excerpt is provided or nothing factual/notable is extractable.

Structured candidate data (JSON):
${JSON.stringify(factSheet, null, 2)}

Resume excerpt (raw extracted text, may include formatting artifacts -- ignore those):
${resumeExcerpt ?? "(no resume text available)"}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  // gemini-1.5-* models have been retired (404 on this API version), so only
  // try current models. Quota availability still varies by Google
  // account/project even within the free tier.
  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const passport = parsePassportJson(raw);

      // Fall back to treating the raw response as plain prose if JSON parsing
      // fails for some reason -- better a slightly-off summary than none.
      const summary = passport ? passportToSummary(passport) || raw : raw;

      await supabase
        .from("candidates")
        .update({ ai_summary: summary, ai_passport: passport })
        .eq("id", candidateId);

      await supabase.from("audit_log").insert({
        actor: user.id,
        action: "ai_summary_generated",
        entity: "candidate",
        entity_id: candidateId,
        detail: { model: modelName, used_resume_text: !!resumeExcerpt },
      });

      return NextResponse.json({ summary, passport });
    } catch (err) {
      lastError = err;
      console.error(`Gemini summary generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "This Gemini API key has 0 free-tier quota on Google's side (not a retry-in-a-minute rate limit -- the daily limit itself is 0). This usually means the key wasn't generated at aistudio.google.com/apikey, or the linked Google Cloud project has the free tier disabled for this region/account. Generate a fresh key at aistudio.google.com/apikey and swap GEMINI_API_KEY in Vercel, or enable billing on the project for standard paid-tier limits."
      : "AI summary generation failed. Please try again.";
  return NextResponse.json({ error: message }, { status: 500 });
}
