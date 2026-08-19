import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";
import {
  mergeTimelines,
  computeStabilityScore,
  type ProfileTimelineEntry,
  type ResumeTimelineEntry,
} from "@/lib/career-timeline";
import { generateCareerTimelineForCandidate } from "@/lib/generate-career-timeline-from-resume";
import { embedCandidate } from "@/lib/embeddings";
import { queueProactiveMatchesForCandidate } from "@/lib/proactive-match";

export type AiPassport = {
  headline?: string;
  compensation_line?: string;
  targets_line?: string;
  stability_line?: string;
  resume_highlights?: string[];
  // Set programmatically (not by the model) whenever the candidate's status
  // wasn't "registered" at generation time -- quick_apply and recruiter-seeded
  // candidates who haven't finished their own profile yet. Surfaced in the UI
  // as a caveat rather than silently presenting a thin profile as complete.
  profile_incomplete?: boolean;
};

// Internal-only decision-support output. Deliberately a SEPARATE type/column
// from AiPassport -- ai_passport/ai_summary are also read by get_client_shortlist
// and the candidate-facing portal, so an AI's private "this candidate looks
// like a job-hopper" risk assessment must never live in that object or it
// would leak straight through those already-existing client-facing queries.
// Only ever select ai_decision_flags from internal, staff-authenticated code.
export type AiDecisionFlags = {
  green_flags?: string[];
  red_flags?: string[];
  watch_areas?: string[];
  recommendation?: "Strong Fit" | "Fit with Reservations" | "Not a Fit";
};

// Structured skill extraction, purpose-built to feed mandate-candidate
// matching (src/lib/candidate-match.ts) with real signal instead of the
// free-text `skills` column alone. Internal-only, same reasoning as
// AiDecisionFlags -- not selected by any client/candidate-facing query.
export type SkillInventory = {
  core_skills?: string[];
  tools_platforms?: string[];
  domain_expertise?: string[];
  soft_skills?: string[];
};

// Compact, sales-specific structured index -- the "Talent Micro-Index".
// Deliberately tiny (well under 120 words rendered) so Stage 2 mandate
// matching (src/lib/candidate-match.ts) can send 150 candidates to Gemini
// per run instead of 60, by passing this instead of full resume text/
// self-assessment/recruiter-scorecard blobs for the bulk of the pool.
// Internal-only, same reasoning as AiDecisionFlags/SkillInventory.
export type TalentMicroIndex = {
  core_motion?: string; // e.g. "Field AE | Inside SDR | Channel | B2C"
  normalized_acv_band?: string; // e.g. "<$50k" | "$50k-$150k" | "$150k+" (or INR equivalent)
  buyer_personas_sold_to?: string[]; // e.g. ["CISO", "CFO", "VP Engineering"]
  verified_quota_attainment_pct?: number; // most recent/typical period, if stated
  disqualifiers?: string[]; // short, factual gaps (e.g. "No team management exp")
};

export type GenerateAiPassportResult =
  | {
      ok: true;
      summary: string;
      passport: AiPassport | null;
      decisionFlags: AiDecisionFlags | null;
      skillInventory: SkillInventory | null;
      talentMicroIndex: TalentMicroIndex | null;
      stabilityScore: number | null;
    }
  | { ok: false; status: number; error: string };

// Everything the model is asked to return in one JSON object (cheaper than a
// second Gemini call) -- immediately split into the client-safe AiPassport
// subset and the internal-only AiDecisionFlags/SkillInventory/TalentMicroIndex
// subsets before anything is persisted or returned up the call stack.
type RawAiOutput = AiPassport & AiDecisionFlags & SkillInventory & TalentMicroIndex;

function parsePassportJson(raw: string): RawAiOutput | null {
  // Gemini sometimes wraps JSON in a ```json fence despite instructions not to.
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object") return parsed as RawAiOutput;
  } catch {
    // fall through
  }
  return null;
}

// Explicit allowlist split -- never spread the raw model output into either
// stored object, so an unexpected/extra key the model invents can never
// accidentally cross from the internal side to the client-visible side.
function splitRawOutput(raw: RawAiOutput): {
  passport: AiPassport;
  decisionFlags: AiDecisionFlags;
  skillInventory: SkillInventory;
  talentMicroIndex: TalentMicroIndex;
} {
  return {
    passport: {
      headline: raw.headline,
      compensation_line: raw.compensation_line,
      targets_line: raw.targets_line,
      stability_line: raw.stability_line,
      resume_highlights: raw.resume_highlights,
    },
    decisionFlags: {
      green_flags: raw.green_flags,
      red_flags: raw.red_flags,
      watch_areas: raw.watch_areas,
      recommendation: raw.recommendation,
    },
    skillInventory: {
      core_skills: raw.core_skills,
      tools_platforms: raw.tools_platforms,
      domain_expertise: raw.domain_expertise,
      soft_skills: raw.soft_skills,
    },
    talentMicroIndex: {
      core_motion: raw.core_motion,
      normalized_acv_band: raw.normalized_acv_band,
      buyer_personas_sold_to: raw.buyer_personas_sold_to,
      verified_quota_attainment_pct: raw.verified_quota_attainment_pct,
      disqualifiers: raw.disqualifiers,
    },
  };
}

function passportToSummary(p: AiPassport): string {
  return [p.headline, p.compensation_line, p.targets_line, p.stability_line].filter(Boolean).join(" ");
}

/**
 * Generates (and persists) a candidate's AI passport. Shared by the
 * staff-triggered route (api/ai-summary) and the client-triggered route
 * (api/public-ai-summary) -- both already authorize the caller before
 * reaching here, this function just needs a Supabase client with enough
 * privilege to read/update the candidate row (service-role or a staff
 * session; RLS otherwise blocks writes to candidates).
 */
export async function generateAiPassportForCandidate(
  candidateId: string,
  supabase: SupabaseClient,
  auditActor: { actor?: string; note?: string } = {}
): Promise<GenerateAiPassportResult> {
  // Single entry point for "give me everything about this candidate,
  // freshly generated" -- career-timeline extraction (which computes
  // stability_score/domain_consistency_score from the resume) always runs
  // first, so the summary/passport/skill-inventory generated below is built
  // on an up-to-date stability read rather than a stale or missing one.
  // This replaces what used to be two independently-triggered efforts (the
  // Career tab's own "Regenerate from resume" button, and this function) --
  // now there's exactly one "Generate/Regenerate" action anywhere on the
  // candidate profile, and it does both jobs in sequence.
  await generateCareerTimelineForCandidate(candidateId, supabase).catch((err) =>
    console.error("Career-timeline step of AI passport generation failed", candidateId, err)
  );

  const { data: candidate, error } = await supabase
    .from("candidates")
    .select(
      "full_name, current_job_title, current_employer, category, sub_domain, secondary_sub_domains, total_experience_years, current_location, notice_period, current_fixed_ctc, current_variable_ctc, expected_fixed_ctc, skills, current_industry, industries, segment_data, self_assessment, recruiter_assessment, resume_file_url, resume_text, status, career_timeline_resume, career_timeline_profile, stability_score, domain_consistency_score"
    )
    .eq("id", candidateId)
    .single();

  if (error || !candidate) {
    return { ok: false, status: 404, error: "Candidate not found" };
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.MISTRAL_API_KEY) {
    return {
      ok: false,
      status: 503,
      error: "AI summary is not configured yet (set GEMINI_API_KEY, GROQ_API_KEY, or MISTRAL_API_KEY on the server).",
    };
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

  // Career Timeline stability facts -- computed deterministically from actual
  // dates (resume-extracted and/or profile-confirmed roles), never left for
  // the model to eyeball or invent from prose. This is what lets the passport
  // honestly call out a job-hopping pattern (or a stable one) with the actual
  // company names/durations behind it, instead of staying silent on tenure.
  const profileEntries = (candidate.career_timeline_profile ?? []) as ProfileTimelineEntry[];
  const resumeEntries = (candidate.career_timeline_resume ?? []) as ResumeTimelineEntry[];
  const mergedTimeline = mergeTimelines(profileEntries, resumeEntries);
  const stability = computeStabilityScore(mergedTimeline);
  const careerStability =
    mergedTimeline.length > 0
      ? {
          stability_label: stability?.label ?? null,
          stability_score_out_of_100: stability?.score ?? null,
          roles_newest_first: [...mergedTimeline]
            .sort((a, b) => ((a.start_month ?? "") < (b.start_month ?? "") ? 1 : -1))
            .map((e) => ({
              company: e.company,
              tenure_months: e.tenureMonths,
              is_current: !e.end_month,
            })),
        }
      : null;

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
    current_industry: candidate.current_industry,
    other_industries_worked_in: (candidate.industries as string[] | null)?.filter(
      (i) => i !== candidate.current_industry
    ),
    self_reported_segment_data: candidate.segment_data,
    self_assessment_writeups: candidate.self_assessment,
    recruiter_scorecard: candidate.recruiter_assessment,
    career_stability: careerStability,
    domain_consistency_score_out_of_100: candidate.domain_consistency_score,
  };

  const firstName = (candidate.full_name as string | null)?.trim().split(/\s+/)[0] ?? "This candidate";

  const prompt = `You are helping a recruiter write a concise, natural-sounding candidate passport for a sales-hiring CRM. This is shown to both recruiters and clients deciding whether to interview someone. It must read like a person wrote it, not like a data dump.

Use ONLY facts given below (structured data + resume excerpt) -- never invent employers, numbers, skills, or achievements that are not present. If the structured data and resume excerpt conflict, trust the structured data. If a field is missing, omit it rather than guessing.

Education/certification accuracy -- this has caused real errors, be careful:
- Resume headers commonly cram multiple DIFFERENT credentials into one pipe- or comma-separated line, e.g. "MBA (Marketing) | IIM Ahmedabad Leadership Program | Six Sigma Green Belt Certified". Each segment is its OWN separate credential from its OWN institution -- never merge adjacent segments into one claim (e.g. that line does NOT mean "MBA from IIM Ahmedabad"; it means an MBA from wherever the resume's Education/Academic Credentials section says, PLUS a separate, shorter leadership program at IIM Ahmedabad, PLUS a separate Six Sigma certification).
- A "Leadership Program", "Executive Program", "Certificate Program", or similar at a prestigious institute is NOT the same as a full degree (MBA/BE/BTech/etc.) from that institute -- never upgrade a short program into "holds an MBA/degree from X".
- If the resume has an explicit "Education"/"Academic Credentials"/"Qualifications" section, that section is the authoritative source for which institution actually granted each degree -- prefer it over a header/summary line whenever the two could be read as conflicting or ambiguous.
- When in doubt about which institution a specific degree came from, state the degree without the institution rather than guessing wrong.

Writing rules -- these matter as much as the facts:
1. Use the candidate's first name ("${firstName}") as the subject of every sentence, not "they/their/them" -- we don't know this candidate's gender, and defaulting to "they" reads impersonal and slightly awkward for a document meant to sound like a person wrote it. Repeating the first name across sentences is fine and preferred (e.g. "Vivek is looking for..." / "Vivek's targets show..."), just never repeat the full name (first + last) more than once.
2. Never just list raw numbers back-to-back. Synthesize. For achievement history specifically: don't dump every percentage range as a comma list -- describe the pattern instead, e.g. "consistently hitting 90%+ of target in 3 of the last 4 quarters, with one softer stretch at 50-75%" rather than "86-90%, 96-100%, 96-100%, and 50-75%".
3. Each line should read as something a sharp recruiter would actually say out loud about this candidate, not a form filled in with data. Vary sentence structure across the three lines instead of repeating the same "X is Y" pattern each time.
4. Keep every line to one sentence, tight and specific -- no filler like "is a great fit" or "has strong experience" without a fact backing it up.

Return ONLY a JSON object (no markdown fence, no commentary) with exactly these keys:
- "headline": one sentence -- ${firstName}'s current role/employer and primary sales domain, using their name.
- "compensation_line": one sentence weaving together current and expected fixed CTC (and variable, if present) -- e.g. frame it as what ${firstName} is looking for, not just "CTC is X". Omit key entirely if no CTC data exists.
- "targets_line": one sentence synthesizing quota/target performance into a pattern or trend (see rule 2 above). Where the underlying fields are present in segment data, work in the actual target size (e.g. "ic_targets"/quarterly or period target amount, with its currency) and typical deal size ("deal_size" band, with its currency) alongside the achievement trend -- don't just report the achievement percentages in isolation when the target amount and deal size are sitting right there in the data. Omit key entirely if no target/achievement data exists at all.
- "stability_line": one honest sentence about ${firstName}'s job tenure pattern, based ONLY on the "career_stability" data below (never estimate tenure from the resume excerpt yourself -- these numbers are computed from actual dates). If "stability_label" is "Frequent Job-Hopper" or several roles show short tenure_months, say so plainly and name the specific role(s)/company(ies) with short stints (e.g. "has moved roles frequently in the last two years, including two-and-a-half-month and two-month stints at X and Y") -- do not soften or omit a real job-hopping pattern just to sound positive. If "stability_label" is "Stable" or "Some Movement" with no notably short stints, note the steady tenure instead. Omit key entirely if "career_stability" is null.
- Note on "best"/"lost" self-assessment write-ups: these are the candidate's own words about a specific win/loss, not resume content. If used, fold the concrete fact (e.g. a named client or deal size mentioned there) into "targets_line" rather than "resume_highlights", since "resume_highlights" is reserved for facts pulled from the actual resume excerpt below.
- "resume_highlights": an array of 2-4 short bullet-point strings pulled from the resume excerpt below -- concrete, factual points only (notable employers/clients, tenure pattern, certifications, named achievements) that AREN'T already covered by the headline/compensation/targets lines. Omit key (or return empty array) if no resume excerpt is provided or nothing factual/notable is extractable. If a highlight mentions a degree/certification, follow the education-accuracy rule above exactly -- attribute each credential to its own institution, don't merge a header line's pipe-separated items into one claim.

The following four keys are for INTERNAL recruiter decision-support only -- never shown to clients or the candidate, so be direct and unsparing here even where the lines above stay diplomatic:
- "green_flags": array of 1-4 short phrases, each a concrete factual reason this candidate is a strong match (e.g. "Consistently exceeded quota for 6 straight quarters", "5+ years in the exact same sub-domain and industry as this hiring need"). Grounded only in the structured data / resume / career_stability -- never invent.
- "red_flags": array of 0-4 short phrases naming concrete risks a recruiter should probe before shortlisting (e.g. "Two roles under 3 months each in the last 18 months", "No quota/achievement data provided", "Expected CTC is a large jump over current fixed CTC with no context given"). Empty array if genuinely nothing stands out -- do not invent a red flag to fill the array. IMPORTANT: this passport is generated once for the candidate generally, not against any one specific mandate -- never flag a candidate's seniority/title level (e.g. "this role is more senior than typical", "overqualified") as a red flag or watch area, since whether a given seniority is a mismatch is entirely relative to whatever specific mandate they're later considered for, which isn't known here. A senior title is a fact about the candidate, not a risk in itself.
- "watch_areas": array of 0-3 short phrases for genuinely ambiguous/uncertain points that are neither clearly good nor bad and need a human judgment call or a clarifying question in the interview (e.g. "Reason for leaving current role not stated", "Industry experience is adjacent but not identical to this mandate's domain"). Empty array if none. Same seniority-level caveat as red_flags above applies here too.
- "recommendation": your own overall read as exactly one of "Strong Fit", "Fit with Reservations", or "Not a Fit" -- the same three-way scale recruiters use in their own manual scorecard (recruiter_scorecard.overall_recommendation below, if already filled in) -- based on weighing green_flags against red_flags/watch_areas. This is a second, independent opinion sitting alongside the recruiter's own call, not a replacement for it.

The following four keys build a structured skill inventory -- also internal only, used to match this candidate against future mandates far more precisely than the free-text "skills" field allows. Extract from BOTH the structured data and resume excerpt; be specific (named tools/platforms, not vague categories) and don't pad with generic filler ("teamwork", "communication") unless the resume/self-assessment genuinely emphasizes it:
- "core_skills": array of the candidate's main functional/sales skills (e.g. "Enterprise B2B sales", "Outbound demand generation", "Key account management").
- "tools_platforms": array of named tools/software/CRMs/platforms they've actually used (e.g. "Salesforce", "HubSpot", "Zoho CRM", "Excel/PowerBI").
- "domain_expertise": array of industry/domain areas they have real experience in (e.g. "SaaS", "EdTech", "FinTech B2B").
- "soft_skills": array of 0-3 soft skills ONLY if concretely evidenced (e.g. "coached team to a 25% qualification-rate lift" -> "team coaching"), never generic unsupported claims. Empty array if nothing concrete.

The following five keys build a compact "Talent Micro-Index" -- also internal only. Its whole purpose is to let mandate matching evaluate 150 candidates per run instead of 60 by sending this tiny object instead of full resume/assessment text for most of the pool, so keep the whole thing genuinely compact (well under 120 words total across all five fields) while still being specific enough to be useful:
- "core_motion": one short phrase for their primary sales motion (e.g. "Field AE", "Inside SDR", "Channel/Partner sales", "B2C direct sales", "Enterprise B2B sales") -- pick the closest fit, don't invent a new category.
- "normalized_acv_band": their typical deal size, normalized to one of "<$50k", "$50k-$150k", "$150k+" (convert INR or other currencies to rough USD-equivalent bands mentally, don't just restate the raw number) -- omit if no deal-size data exists anywhere.
- "buyer_personas_sold_to": array of 0-4 short titles/roles they've actually sold to if stated or clearly implied (e.g. "CFO", "VP Engineering", "Small business owners") -- omit or empty array if not evidenced.
- "verified_quota_attainment_pct": their most recent or most typical quota attainment as a single integer percent, if genuinely stated -- omit entirely if no attainment data exists (never estimate one).
- "disqualifiers": array of 0-3 short, factual capability gaps a recruiter would want flagged fast when skimming (e.g. "No team management experience", "No enterprise deal experience", "No experience carrying an individual quota") -- empty array if none apparent.

Structured candidate data (JSON):
${JSON.stringify(factSheet, null, 2)}

Resume excerpt (raw extracted text, may include formatting artifacts -- ignore those):
${resumeExcerpt ?? "(no resume text available)"}`;

  // Multi-provider fallback (Gemini -> Groq -> Mistral, see ai-providers.ts)
  // so a Gemini free-tier quota exhaustion no longer stalls summary
  // generation entirely -- this is what left 76% of candidates without an
  // ai_summary before GROQ_API_KEY/MISTRAL_API_KEY were added as fallbacks.
  try {
    {
      const { text: raw, provider: usedProvider, model: usedModel } = await generateTextWithFallback(prompt);
      const rawOutput = parsePassportJson(raw);
      const { passport, decisionFlags, skillInventory, talentMicroIndex } = rawOutput
        ? splitRawOutput(rawOutput)
        : { passport: null, decisionFlags: null, skillInventory: null, talentMicroIndex: null };

      // Fall back to treating the raw response as plain prose if JSON parsing
      // fails for some reason -- better a slightly-off summary than none.
      const summary = passport ? passportToSummary(passport) || raw : raw;

      // Candidate hasn't finished their own profile (quick_apply stub or a
      // recruiter-seeded record awaiting a completion invite) -- flag this on
      // the passport itself so anyone viewing it knows the data is partial,
      // and record the status we generated against so a later sweep can tell
      // this summary is stale once the profile actually completes.
      const candidateStatus = (candidate.status as string | null) ?? null;
      const isIncomplete = candidateStatus !== "registered";
      const finalPassport: AiPassport | null = passport
        ? { ...passport, profile_incomplete: isIncomplete || undefined }
        : passport;

      await supabase
        .from("candidates")
        .update({
          ai_summary: summary,
          ai_passport: finalPassport,
          ai_decision_flags: decisionFlags,
          skill_inventory: skillInventory,
          talent_micro_index: talentMicroIndex,
          ai_summary_generated_status: candidateStatus,
          ai_summary_generated_at: new Date().toISOString(),
        })
        .eq("id", candidateId);

      await supabase.from("audit_log").insert({
        actor: auditActor.actor ?? null,
        action: "ai_summary_generated",
        entity: "candidate",
        entity_id: candidateId,
        detail: { model: usedModel, provider: usedProvider, used_resume_text: !!resumeExcerpt, note: auditActor.note },
      });

      // Memorize this candidate for fast mandate matching -- every full
      // generation (new-profile auto-trigger, manual regenerate, or the
      // smart regenerate-on-view after an assessment update) also refreshes
      // the embedding, so the profile is immediately findable by
      // matchCandidatesForMandate's semantic recall path without waiting
      // for the next embed-candidates cron sweep. Uses a separate Gemini
      // quota bucket (text-embedding-004) from the generateContent calls
      // above, so this never competes with summary-generation quota.
      //
      // Awaited (not fire-and-forget) deliberately -- this function is
      // called both from waitUntil()-wrapped background triggers AND
      // directly awaited from the candidate detail page's smart
      // regenerate-on-view. In the latter case there's no waitUntil()
      // registered, so an un-awaited promise here would risk the exact
      // same "Vercel freezes the invocation right after the response is
      // sent" bug already fixed elsewhere for this same reason. Wrapped in
      // try/catch so an embedding failure never fails the generation that
      // already succeeded.
      try {
        await embedCandidate(
          {
            id: candidateId,
            full_name: candidate.full_name as string | null,
            category: candidate.category as string | null,
            sub_domain: candidate.sub_domain as string | null,
            secondary_sub_domains: candidate.secondary_sub_domains as string[] | null,
            current_job_title: candidate.current_job_title as string | null,
            current_employer: candidate.current_employer as string | null,
            current_industry: candidate.current_industry as string | null,
            industries: candidate.industries as string[] | null,
            total_experience_years: candidate.total_experience_years as number | null,
            current_location: candidate.current_location as string | null,
            skills: candidate.skills as string | null,
            segment_data: candidate.segment_data as Record<string, unknown> | null,
            ai_summary: summary,
            resume_text: resumeText,
          },
          supabase
        );
      } catch (err) {
        console.error("Embedding refresh failed after AI passport generation", candidateId, err);
      }

      // Gated proactive matcher: a cheap (~<10ms, $0 API cost) pgvector
      // similarity check of this candidate's just-refreshed embedding
      // against every open mandate's embedding. Only pairs crossing a high
      // confidence threshold get queued for the next batched Gemini
      // evaluation sweep (api/cron/proactive-match-sweep) -- this is the
      // "system notices a strong candidate the moment they register/update,
      // without burning a Gemini call per registration" behavior. Never
      // throws into the generation result; a failure here just means this
      // candidate waits for the sweep's own periodic scan instead.
      try {
        await queueProactiveMatchesForCandidate(candidateId, supabase);
      } catch (err) {
        console.error("Proactive-match queueing failed after AI passport generation", candidateId, err);
      }

      return {
        ok: true,
        summary,
        passport: finalPassport,
        decisionFlags,
        skillInventory,
        talentMicroIndex,
        stabilityScore: (candidate.stability_score as number | null) ?? stability?.score ?? null,
      };
    }
  } catch (err) {
    console.error("AI summary generation failed on every configured provider", candidateId, err);
    const message =
      err instanceof Error
        ? `AI summary generation failed on every configured provider. ${err.message}`
        : "AI summary generation failed. Please try again.";
    return { ok: false, status: 500, error: message };
  }
}
