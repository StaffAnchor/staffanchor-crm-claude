import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

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
      "full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, notice_period, current_fixed_ctc, current_variable_ctc, expected_fixed_ctc, segment_data, self_assessment, recruiter_assessment"
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
    self_reported_segment_data: candidate.segment_data,
    self_assessment_writeups: candidate.self_assessment,
    recruiter_scorecard: candidate.recruiter_assessment,
  };

  const prompt = `You are helping a recruiter write a concise internal candidate summary for a sales-hiring CRM.
Use ONLY the facts given below — never invent employers, numbers, skills, or achievements that are not present.
If a field is missing, simply omit it rather than guessing.
Write 4-6 sentences, plain prose, no headings, no bullet points, professional and neutral tone.
Cover: who they are and current role, relevant sales background/sub-domain, experience level, compensation expectations if present, and any notable recruiter assessment notes if present.

Candidate data (JSON):
${JSON.stringify(factSheet, null, 2)}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  // Try a couple of free-tier model names in order, since quota availability
  // varies by Google account/project even within the free tier.
  const modelsToTry = ["gemini-1.5-flash", "gemini-1.5-flash-8b", "gemini-2.0-flash"];

  let lastError: unknown = null;
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const summary = result.response.text().trim();

      await supabase
        .from("candidates")
        .update({ ai_summary: summary })
        .eq("id", candidateId);

      await supabase.from("audit_log").insert({
        actor: user.id,
        action: "ai_summary_generated",
        entity: "candidate",
        entity_id: candidateId,
        detail: { model: modelName },
      });

      return NextResponse.json({ summary });
    } catch (err) {
      lastError = err;
      console.error(`Gemini summary generation failed with model ${modelName}`, err);
    }
  }

  const message =
    lastError instanceof Error && lastError.message.includes("429")
      ? "Google's free Gemini tier has no quota available for this API key right now (rate/quota limited). Try again in a minute, or enable billing on the Gemini API key for higher limits."
      : "AI summary generation failed. Please try again.";
  return NextResponse.json({ error: message }, { status: 500 });
}
