import crypto from "crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { GEMINI_QUALITY_MODELS, generateTextWithFallback } from "@/lib/ai-providers";
import { logAiUsage } from "@/lib/ai-usage";
import { extractResumeText } from "@/lib/resume-text";

// Reads a candidate's CV into structured facts a requirement can be checked
// against: for each job, what they sold, to whom, in which segment, with
// what motion, any stated deal size / quota / team size, plus tools,
// education and a few honesty flags (for example, a headline that claims
// something the job history does not back up). Everything not stated in
// the CV is null: this never guesses, so "not in the CV" stays
// distinguishable from "no".

export type CvRole = {
  company: string | null;
  title: string | null;
  start: string | null;
  end: string | null;
  is_current: boolean;
  industry: string | null;
  sells: string | null;
  customer_type: "b2b" | "b2c" | "b2b2c" | "mixed" | null;
  segments: string[];
  motion: string | null;
  buyers: string[];
  deal_size: string | null;
  quota_or_target: string | null;
  achievement: string | null;
  team_size: number | null;
  evidence: string | null;
};

export type CvFlag = { kind: "gap" | "short_stints" | "claim_not_backed" | "inconsistent" | "other"; detail: string };

export type CvFacts = {
  headline_claim: string | null;
  experience_years_from_dates: number | null;
  roles: CvRole[];
  sales: {
    primary_motion: string | null;
    customer_type: "b2b" | "b2c" | "b2b2c" | "mixed" | null;
    segments: string[];
    typical_deal_size: string | null;
    sales_cycle: string | null;
    owned_full_cycle: "yes" | "no" | "unclear";
    hunter_or_farmer: "hunter" | "farmer" | "both" | "unclear";
    leads_team: boolean | null;
    largest_team_size: number | null;
    best_achievement: string | null;
  };
  industries: string[];
  tools: string[];
  geographies: string[];
  languages: string[];
  education: { degree: string | null; institution: string | null; year: string | null }[];
  certifications: string[];
  stated: { current_ctc: string | null; expected_ctc: string | null; notice_period: string | null; location: string | null; relocation: string | null };
  flags: CvFlag[];
};

const MAX_ROLES = 8;
const MAX_RESUME_CHARS = 14000;

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
};
const strList = (v: unknown, cap: number, max = 80): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.map((x) => str(x, max)).filter((x): x is string => !!x))).slice(0, cap) : [];
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null);
const CUSTOMER = ["b2b", "b2c", "b2b2c", "mixed"] as const;
const SEGMENTS = ["smb", "mid-market", "enterprise", "consumer"];
const segmentList = (v: unknown): string[] => strList(v, 4, 30).map((x) => x.toLowerCase()).filter((x) => SEGMENTS.includes(x));

export function normalizeCvFacts(raw: unknown): CvFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const rolesRaw = Array.isArray(r.roles) ? r.roles : [];
  const roles: CvRole[] = rolesRaw.slice(0, MAX_ROLES * 2).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    return {
      company: str(o.company),
      title: str(o.title),
      start: str(o.start, 10),
      end: str(o.end, 10),
      is_current: o.is_current === true,
      industry: str(o.industry),
      sells: str(o.sells),
      customer_type: oneOf(o.customer_type, CUSTOMER),
      segments: segmentList(o.segments),
      motion: str(o.motion, 40),
      buyers: strList(o.buyers, 5, 40),
      deal_size: str(o.deal_size, 80),
      quota_or_target: str(o.quota_or_target, 120),
      achievement: str(o.achievement, 160),
      team_size: num(o.team_size),
      evidence: str(o.evidence, 200),
    };
  }).filter((r) => r.company || r.title).slice(0, MAX_ROLES);
  const s = (r.sales ?? {}) as Record<string, unknown>;
  const st = (r.stated ?? {}) as Record<string, unknown>;
  const edu = Array.isArray(r.education) ? r.education : [];
  const flags = Array.isArray(r.flags) ? r.flags : [];
  if (roles.length === 0 && !str(r.headline_claim)) return null;
  return {
    headline_claim: str(r.headline_claim),
    experience_years_from_dates: num(r.experience_years_from_dates),
    roles,
    sales: {
      primary_motion: str(s.primary_motion, 40),
      customer_type: oneOf(s.customer_type, CUSTOMER),
      segments: segmentList(s.segments),
      typical_deal_size: str(s.typical_deal_size, 80),
      sales_cycle: str(s.sales_cycle, 60),
      owned_full_cycle: oneOf(s.owned_full_cycle, ["yes", "no", "unclear"] as const) ?? "unclear",
      hunter_or_farmer: oneOf(s.hunter_or_farmer, ["hunter", "farmer", "both", "unclear"] as const) ?? "unclear",
      leads_team: typeof s.leads_team === "boolean" ? s.leads_team : null,
      largest_team_size: num(s.largest_team_size),
      best_achievement: str(s.best_achievement, 200),
    },
    industries: strList(r.industries, 8, 50),
    tools: strList(r.tools, 12, 40),
    geographies: strList(r.geographies, 6, 40),
    languages: strList(r.languages, 6, 30),
    education: edu.slice(0, 4).map((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      return { degree: str(o.degree, 80), institution: str(o.institution, 100), year: str(o.year, 10) };
    }),
    certifications: strList(r.certifications, 6, 80),
    stated: {
      current_ctc: str(st.current_ctc, 40),
      expected_ctc: str(st.expected_ctc, 40),
      notice_period: str(st.notice_period, 40),
      location: str(st.location, 60),
      relocation: str(st.relocation, 60),
    },
    flags: flags
      .slice(0, 5)
      .map((f) => {
        const o = (f ?? {}) as Record<string, unknown>;
        const kind = oneOf(o.kind, ["gap", "short_stints", "claim_not_backed", "inconsistent", "other"] as const) ?? "other";
        const detail = str(o.detail, 240);
        return detail ? { kind, detail } : null;
      })
      .filter((f): f is CvFlag => !!f),
  };
}

export function parseCvFactsJson(text: string): CvFacts | null {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return normalizeCvFacts(JSON.parse(cleaned));
  } catch {
    return null;
  }
}

export function buildCvFactsPrompt(resumeText: string, selfReported: Record<string, unknown>): string {
  return `You are a senior recruiter at StaffAnchor, a firm that places sales professionals. Read the CV below and extract structured facts a recruiter will use to check this person against a client's requirements.

Strict rules:
- Use ONLY what the CV states. If something is not stated, use null (or an empty list). Never guess a deal size, quota, team size, segment or industry that the CV does not state or clearly imply. "Not stated" must stay distinguishable from "no".
- Dates: use "YYYY-MM" (or "YYYY" if only the year is given). A role still held has "end": null and "is_current": true.
- experience_years_from_dates: total years of work computed from the dated roles, rounded to one decimal; null if dates are too incomplete.
- For each role: "sells" is what the product or service actually is. "industry" is the company's industry, taken from the company and what it sells, not from the candidate's headline. "customer_type" is b2b, b2c, b2b2c or mixed. "segments" is any of "smb", "mid-market", "enterprise", "consumer" that the CV supports. "motion" is one short phrase such as "inside sales", "field sales", "enterprise AE", "SDR/BDR", "channel/partner", "key account management", "business development", "team leadership". "buyers" are the titles sold to. "deal_size", "quota_or_target" and "achievement" are copied as stated, with units. "team_size" is the number of people managed, if stated. "evidence" is a short quote (under 20 words) from the CV supporting this role's entry.
- sales.owned_full_cycle: "yes" only if the CV shows prospecting through closing by the person; "no" if clearly only part of the cycle (for example only lead generation or only account servicing); otherwise "unclear". hunter_or_farmer likewise: "unclear" unless the CV shows it.
- flags (0 to 5, each with kind and a one-sentence detail, only real issues): "gap" (an unexplained gap of 6 months or more), "short_stints" (several roles under 12 months), "claim_not_backed" (for example the headline or skills claim a domain, such as B2B SaaS, that the job history does not show), "inconsistent" (dates or titles that do not add up), "other". Empty if nothing stands out. Do not flag seniority or notice period as risks.
- headline_claim: the one-line positioning the CV gives itself, if any.
- stated: current_ctc, expected_ctc, notice_period, location and relocation, only if the CV says them in so many words.
- Do not include the candidate's name, email or phone.

Self-reported profile data (may be out of date or wrong; the CV is the source of truth for the facts above):
${JSON.stringify(selfReported)}

CV text:
${resumeText}

Return ONLY a JSON object with exactly these keys:
{
  "headline_claim": string|null,
  "experience_years_from_dates": number|null,
  "roles": [{"company","title","start","end","is_current","industry","sells","customer_type","segments":[],"motion","buyers":[],"deal_size","quota_or_target","achievement","team_size","evidence"}],
  "sales": {"primary_motion","customer_type","segments":[],"typical_deal_size","sales_cycle","owned_full_cycle","hunter_or_farmer","leads_team","largest_team_size","best_achievement"},
  "industries": [], "tools": [], "geographies": [], "languages": [],
  "education": [{"degree","institution","year"}],
  "certifications": [],
  "stated": {"current_ctc","expected_ctc","notice_period","location","relocation"},
  "flags": [{"kind","detail"}]
}
List roles newest first, at most ${MAX_ROLES}.`;
}

export type CvFactsOutcome =
  | { ok: true; candidateId: string; skipped?: boolean; roles: number; flags: number }
  | { ok: false; candidateId: string; error: string };

async function loadResumeText(candidate: { resume_text: string | null; resume_file_url: string | null }, candidateId: string, admin: SupabaseClient): Promise<string | null> {
  if (candidate.resume_text && candidate.resume_text.trim().length > 200) return candidate.resume_text;
  if (!candidate.resume_file_url) return null;
  try {
    const cleanPath = candidate.resume_file_url.replace(/^resumes\//, "");
    const { data: signed } = await admin.storage.from("resumes").createSignedUrl(cleanPath, 300);
    if (!signed?.signedUrl) return null;
    const buffer = await (await fetch(signed.signedUrl)).arrayBuffer();
    const text = await extractResumeText(buffer, cleanPath);
    if (text) await admin.from("candidates").update({ resume_text: text }).eq("id", candidateId);
    return text;
  } catch (err) {
    console.error("[cv-facts] resume download/parse failed", candidateId, err instanceof Error ? err.message : err);
    return null;
  }
}

// Reads one candidate's CV and stores the facts. Skips if the CV text has
// not changed since the last read (unless force). Never throws.
export async function extractCvFactsForCandidate(candidateId: string, admin: SupabaseClient, opts: { force?: boolean } = {}): Promise<CvFactsOutcome> {
  try {
    const { data: c, error } = await admin
      .from("candidates")
      .select("resume_text, resume_file_url, current_job_title, current_employer, total_experience_years, current_location, notice_period, current_fixed_ctc, expected_fixed_ctc")
      .eq("id", candidateId)
      .single();
    if (error || !c) return { ok: false, candidateId, error: "Candidate not found" };

    const text = await loadResumeText(c, candidateId, admin);
    if (!text) return { ok: false, candidateId, error: "No readable CV on file" };
    const excerpt = text.slice(0, MAX_RESUME_CHARS);
    const hash = crypto.createHash("sha256").update(excerpt).digest("hex");

    if (!opts.force) {
      const { data: existing } = await admin.from("candidate_cv_facts").select("source_hash").eq("candidate_id", candidateId).maybeSingle();
      if (existing?.source_hash === hash) return { ok: true, candidateId, skipped: true, roles: 0, flags: 0 };
    }

    const prompt = buildCvFactsPrompt(excerpt, {
      current_job_title: c.current_job_title,
      current_employer: c.current_employer,
      total_experience_years: c.total_experience_years,
      location: c.current_location,
      notice_period: c.notice_period,
      current_fixed_ctc_lakhs: c.current_fixed_ctc,
      expected_fixed_ctc_lakhs: c.expected_fixed_ctc,
    });

    let result;
    try {
      result = await generateTextWithFallback(prompt, { geminiModels: GEMINI_QUALITY_MODELS, json: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await logAiUsage({ purpose: "cv_facts", refType: "candidate", refId: candidateId, error: message });
      return { ok: false, candidateId, error: message.includes("429") ? "AI is at its usage limit" : "AI call failed" };
    }
    const facts = parseCvFactsJson(result.text);
    await logAiUsage({ purpose: "cv_facts", refType: "candidate", refId: candidateId, result, error: facts ? undefined : "unparseable response" });
    if (!facts) return { ok: false, candidateId, error: "The AI response couldn't be read" };

    const { error: upErr } = await admin
      .from("candidate_cv_facts")
      .upsert({ candidate_id: candidateId, facts, source_hash: hash, model: result.model, extracted_at: new Date().toISOString() }, { onConflict: "candidate_id" });
    if (upErr) return { ok: false, candidateId, error: upErr.message };
    return { ok: true, candidateId, roles: facts.roles.length, flags: facts.flags.length };
  } catch (err) {
    return { ok: false, candidateId, error: err instanceof Error ? err.message : String(err) };
  }
}

// Newest candidates first, skipping anyone already read from their current CV.
export async function pickCandidatesForCvFacts(admin: SupabaseClient, limit: number, scan = 400): Promise<string[]> {
  const { data: recent } = await admin
    .from("candidates")
    .select("id")
    .or("resume_file_url.not.is.null,resume_text.not.is.null")
    .order("created_at", { ascending: false })
    .limit(scan);
  const ids = (recent ?? []).map((r) => r.id as string);
  if (ids.length === 0) return [];
  const { data: done } = await admin.from("candidate_cv_facts").select("candidate_id").in("candidate_id", ids);
  const have = new Set((done ?? []).map((d) => d.candidate_id as string));
  return ids.filter((id) => !have.has(id)).slice(0, limit);
}

// Service-role client for writing facts (staff sessions can only read them).
// Null when the server has no service key, so callers can skip quietly.
export function getServiceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}
