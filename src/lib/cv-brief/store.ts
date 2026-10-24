import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTextWithFallback, GEMINI_QUALITY_MODELS } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";
import { EDUCATION, cleanJob, emptyData, emptyJob, sanitize, type Basics, type CvData } from "./config";

export type BriefRow = {
  id: string; token: string; booking_id: string | null; candidate_id: string | null; track: string; name: string; email: string | null; phone: string | null;
  data: unknown; status: "sent" | "started" | "submitted"; cv_path: string | null; cv_name: string | null; consent_at: string | null; consent_version: string | null;
  submit_count: number; created_at: string; updated_at: string; started_at: string | null; submitted_at: string | null;
};

export const COLUMNS = "id, token, booking_id, candidate_id, track, name, email, phone, data, status, cv_path, cv_name, consent_at, consent_version, submit_count, created_at, updated_at, started_at, submitted_at";

export const validToken = (t: unknown): t is string => typeof t === "string" && /^[a-f0-9]{64}$/.test(t);

export const jobsLink = (token: string) => `${process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com"}/edge/cv/${token}`;

const last10 = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

/** What StaffAnchor already knows about this person, to fill the first screen. Never overwrites what they typed. */
export async function candidatePrefill(db: SupabaseClient, email: string | null, phone: string | null): Promise<{ candidateId: string | null; basics: Partial<Basics> }> {
  const select = "id, full_name, email, phone, current_location, current_employer, current_job_title, total_experience_years, linkedin_url, highest_qualification, current_employment_status";
  let c: Record<string, unknown> | null = null;
  if (email) c = (await db.from("candidates").select(select).ilike("email", email).limit(1).maybeSingle()).data;
  const key = last10(phone);
  if (!c && key.length === 10) c = (await db.from("candidates").select(select).like("phone", `%${key}`).limit(1).maybeSingle()).data;
  if (!c) return { candidateId: null, basics: {} };
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const edu = EDUCATION.find((e) => e === s(c!.highest_qualification)) ?? "";
  return {
    candidateId: c.id as string,
    basics: {
      name: s(c.full_name), email: s(c.email), phone: s(c.phone), city: s(c.current_location), employer: s(c.current_employer), title: s(c.current_job_title),
      expYears: typeof c.total_experience_years === "number" ? c.total_experience_years : null, linkedin: s(c.linkedin_url), education: edu,
    },
  };
}

export async function briefForBooking(db: SupabaseClient, bookingId: string): Promise<BriefRow | null> {
  const { data: existing } = await db.from("cv_briefs").select(COLUMNS).eq("booking_id", bookingId).maybeSingle();
  if (existing) return existing as BriefRow;
  const { data: b } = await db.from("pro_bookings").select("id, name, email, phone").eq("id", bookingId).maybeSingle();
  if (!b) return null;
  const pre = await candidatePrefill(db, b.email, b.phone);
  const data = emptyData();
  data.basics = { ...data.basics, ...pre.basics, name: b.name, email: b.email ?? pre.basics.email ?? "", phone: b.phone ?? pre.basics.phone ?? "" };
  const { data: row, error } = await db.from("cv_briefs").insert({ booking_id: bookingId, candidate_id: pre.candidateId, name: b.name, email: b.email, phone: b.phone, data }).select(COLUMNS).single();
  if (error) {
    const { data: again } = await db.from("cv_briefs").select(COLUMNS).eq("booking_id", bookingId).maybeSingle();
    return (again as BriefRow | null) ?? null;
  }
  return row as BriefRow;
}

export async function standaloneBrief(db: SupabaseClient, input: { name: string; email?: string | null; phone?: string | null }): Promise<BriefRow | null> {
  const pre = await candidatePrefill(db, input.email ?? null, input.phone ?? null);
  const data = emptyData();
  data.basics = { ...data.basics, ...pre.basics, name: input.name, email: input.email ?? pre.basics.email ?? "", phone: input.phone ?? pre.basics.phone ?? "" };
  const { data: row } = await db.from("cv_briefs").insert({ candidate_id: pre.candidateId, name: input.name.slice(0, 120), email: input.email || null, phone: input.phone || null, data }).select(COLUMNS).single();
  return (row as BriefRow | null) ?? null;
}

// ---- reading an uploaded CV ----

/** The CV text with contact details taken out before it goes to the AI (emails, phone numbers, links). */
export function stripContacts(t: string): string {
  return t
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, " ")
    .replace(/https?:\/\/\S+|www\.\S+|linkedin\.com\/\S+/gi, " ")
    .replace(/(\+?\d[\d\s().-]{8,}\d)/g, " ");
}

function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const PROMPT = (cv: string) => `You read a CV and list only what it plainly says. Do not infer, guess or add anything.
Return JSON: {"jobs":[{"employer":"","title":"","city":"","start":"YYYY-MM or empty","end":"YYYY-MM or empty","current":false}],"education":{"level":"","detail":""},"certifications":""}
- Jobs newest first, at most 8. Use empty strings for anything the CV does not state. If only a year is given, use YYYY-01 for start and YYYY-12 for end.
- "current" is true only if the CV says present or current for that job.
- education.level must be exactly one of: ${EDUCATION.join(" | ")} or empty. detail is the degree and institution as written.
- certifications is a short comma-separated list as written, or empty.

CV:
${cv}`;

export type ReadResult = { ok: true; jobs: number; data: CvData } | { ok: false; error: string };

/** Reads the CV into the brief: only fills jobs, education and certifications that are still empty, and tags jobs as read from the CV. */
export async function readCvIntoBrief(db: SupabaseClient, brief: BriefRow, cvPath: string): Promise<ReadResult> {
  const { data: file, error } = await db.storage.from("resume-orders").download(cvPath);
  if (error || !file) return { ok: false, error: "Couldn't open the uploaded file." };
  const text = await extractResumeText(await file.arrayBuffer(), cvPath);
  if (!text || text.trim().length < 80) return { ok: false, error: "Couldn't read any text from that file." };
  let parsed: Record<string, unknown> | null = null;
  try {
    const res = await generateTextWithFallback(PROMPT(stripContacts(text).slice(0, 20000)), { json: true, thinkingBudget: 0, geminiModels: GEMINI_QUALITY_MODELS });
    parsed = parseJson(res.text);
  } catch (e) {
    console.error("cv-brief read failed", e);
  }
  if (!parsed) return { ok: false, error: "Couldn't read the CV automatically." };

  const data = sanitize(brief.data);
  let added = 0;
  if (data.jobs.length === 0 && Array.isArray(parsed.jobs)) {
    data.jobs = parsed.jobs.slice(0, 8).map((j) => ({ ...cleanJob({ ...emptyJob(), ...(j as object), fromCv: true }), fromCv: true })).filter((j) => j.employer || j.title);
    added = data.jobs.length;
  }
  const edu = (parsed.education ?? {}) as { level?: unknown; detail?: unknown };
  if (!data.basics.education && typeof edu.level === "string" && EDUCATION.includes(edu.level)) data.basics.education = edu.level;
  if (!data.basics.educationDetail && typeof edu.detail === "string") data.basics.educationDetail = edu.detail.slice(0, 300);
  if (!data.extras.certifications && typeof parsed.certifications === "string") data.extras.certifications = parsed.certifications.slice(0, 600);
  return { ok: true, jobs: added, data: sanitize(data) };
}
