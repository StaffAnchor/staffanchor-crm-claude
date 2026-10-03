import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";
import { logTimeSaved } from "@/lib/time-saved";
import {
  b2bSoldGroups,
  b2cSoldGroups,
  industrySoldGroups,
  yourLevelOptions,
  customerSegmentOptions,
  teamSizeBands,
  flat,
  keepAllowed,
} from "@/lib/candidate-taxonomy";

export const runtime = "nodejs";

// Bulk CV Upload -- step 1 of 2 (extract-and-review, never a direct write).
// A recruiter drops in up to 10 CVs downloaded from a portal (Naukri,
// LinkedIn, etc.) that all pertain to one mandate/profile type. For each
// resume this: uploads it to Storage, extracts text, asks Gemini for the
// handful of identity fields a resume actually states outright (name,
// email, phone, city, current employer/title, and languages -- but
// deliberately NOT primary/secondary specialization, which the candidate
// picks themselves later), and flags a likely duplicate if the extracted
// email already exists in `candidates`. Nothing is written to the
// candidates table here -- the review UI calls the existing
// /api/candidate-create route per confirmed row, same as "Create candidate"
// does today, so this route's only job is turning a pile of PDFs into
// pre-filled, editable draft rows.
const MAX_FILES = 10;

export type BulkExtractResult = {
  fileName: string;
  ok: boolean;
  error?: string;
  resumeFileUrl?: string;
  extracted?: {
    full_name: string | null;
    email: string | null;
    phone: string | null;
    current_location: string | null;
    current_employer: string | null;
    current_job_title: string | null;
    total_experience_years: number | null;
    languages_known: string[];
    // Read from the CV to line up with the candidate registration form.
    category: string | null;
    sells_now: string[];
    sells_before: string[];
    role_level: string | null;
    team_size: string | null;
    industries: string[];
    customer_segments: string[];
    tools: string[];
    skills: string[];
    current_industry: string | null;
    highest_qualification: string | null;
    linkedin_url: string | null;
    current_fixed_ctc: number | null;
    notice_period: string | null;
  };
  duplicate?: { candidateId: string; fullName: string } | null;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!profile || !["admin", "recruiter", "partner"].includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "This feature isn't fully configured yet (missing SUPABASE_SERVICE_ROLE_KEY)." },
      { status: 503 }
    );
  }
  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  const formData = await req.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} resumes at a time.` }, { status: 400 });
  }

  const aiConfigured = !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY);

  // What the recruiter is sure about for this batch. "auto" (or blank) means
  // "not sure -- read it from each CV".
  const rawType = String(formData.get("profileType") ?? "auto");
  const hint = {
    category: ["b2b_sales", "b2c_sales", "non_sales"].includes(rawType) ? rawType : null,
    sells: String(formData.get("sells") ?? "").trim() || null,
  };

  const results: BulkExtractResult[] = [];
  for (const file of files) {
    results.push(await processOne(file, admin, aiConfigured, user.id, hint));
  }

  return NextResponse.json({ results });
}

async function processOne(
  file: File,
  admin: SupabaseClient,
  aiConfigured: boolean,
  recruiterId: string,
  hint: { category: string | null; sells: string | null }
): Promise<BulkExtractResult> {
  const fileName = file.name;
  try {
    const buffer = await file.arrayBuffer();

    // Same sanitization as every other resume-upload path in this repo
    // (ApplyForm.tsx / candidate-create) -- Storage object keys reject
    // brackets/parens/non-ASCII that real downloaded-CV filenames commonly
    // contain (Naukri exports especially).
    const safeName = fileName
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("resumes").upload(path, Buffer.from(buffer), {
      contentType: file.type || undefined,
    });
    if (uploadError) {
      return { fileName, ok: false, error: `Upload failed: ${uploadError.message}` };
    }

    const resumeText = await extractResumeText(buffer, fileName);
    if (!resumeText) {
      return {
        fileName,
        ok: false,
        error: "Couldn't read text from this file (only PDF and DOCX are supported).",
        resumeFileUrl: path,
      };
    }

    // FIX: this used to report ok: true with every field silently defaulted
    // to null/empty whenever Gemini failed on all 3 fallback models (e.g. it
    // returned a refusal or non-JSON output for an unusually-formatted
    // resume) -- so the recruiter just saw a completely blank row with no
    // indication anything had gone wrong, and Save was blocked downstream by
    // "A valid email is required" with zero clue why. Report it as a real
    // failure instead, same as the "couldn't read text" case above, so the
    // UI shows an error banner and the recruiter knows to fill the row in
    // manually rather than assuming the tool just found nothing.
    const extracted = await extractFieldsWithGemini(resumeText, aiConfigured, hint);
    if (!extracted) {
      return {
        fileName,
        ok: false,
        error: "Couldn't extract fields from this resume automatically. Fill them in manually below.",
        resumeFileUrl: path,
      };
    }

    let duplicate: BulkExtractResult["duplicate"] = null;
    if (extracted.email) {
      const { data: existing } = await admin
        .from("candidates")
        .select("id, full_name")
        .ilike("email", extracted.email)
        .limit(1)
        .maybeSingle();
      if (existing) {
        duplicate = { candidateId: existing.id, fullName: existing.full_name };
        // A duplicate caught here is one the recruiter would otherwise have
        // discovered later -- after re-typing/re-uploading a profile that
        // already exists and having to untangle two records.
        await logTimeSaved(admin, {
          actionType: "duplicate_detected",
          recruiterId,
          entityType: "candidate",
          entityId: existing.id,
        });
      }
    }

    return { fileName, ok: true, resumeFileUrl: path, extracted, duplicate };
  } catch (err) {
    return { fileName, ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

// Indian numbers frequently come back from Gemini with the country code
// still attached (a resume's "+91 98765 43210" survives the digits-only
// strip below as "919876543210", 12 digits) even though the prompt asks it
// not to. Trim that down to the bare 10-digit mobile number. Deliberately
// narrow -- only a 12-digit string starting with the Indian "91" prefix is
// touched, so a genuinely international number (UAE "971...", etc., which
// won't be exactly 12 digits starting with 91) is left exactly as extracted.
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

const B2B_SELLS = flat(b2bSoldGroups);
const B2C_SELLS = flat(b2cSoldGroups);
const INDUSTRIES = flat(industrySoldGroups);
const LEVELS = yourLevelOptions.map((l) => l.value);
const CATEGORIES = ["b2b_sales", "b2c_sales", "non_sales"];

async function extractFieldsWithGemini(
  resumeText: string,
  aiConfigured: boolean,
  hint: { category: string | null; sells: string | null }
): Promise<BulkExtractResult["extracted"] | null> {
  if (!aiConfigured) return null;

  const categoryRule = hint.category
    ? `The recruiter has already set the profile type to "${hint.category}". Return that value for "category".`
    : `"category" is one of "b2b_sales" (sells to businesses, e.g. SaaS, IT, industrial, corporate services), "b2c_sales" (sells to consumers, e.g. insurance, loans, EdTech, real estate, retail, telecom/DTH) or "non_sales" (marketing, HR, finance, operations, engineering and similar). Decide from what they actually sell.`;
  const sellsRule = hint.sells
    ? `The recruiter has already set what they sell to "${hint.sells}": return exactly that as the first item of "sells_now".`
    : `"sells_now" is what they sell in their CURRENT or most recent role: up to 3 values copied EXACTLY from the allowed list that matches the category.`;

  const prompt = `Read this resume and return ONLY a JSON object (no markdown, no commentary) shaped exactly like:
{"full_name": string|null, "email": string|null, "phone": string|null, "current_location": string|null, "current_employer": string|null, "current_job_title": string|null, "total_experience_years": number|null, "languages_known": string[],
"category": string|null, "sells_now": string[], "sells_before": string[], "role_level": string|null, "team_size": string|null, "industries": string[], "customer_segments": string[], "tools": string[], "skills": string[], "current_industry": string|null, "highest_qualification": string|null, "linkedin_url": string|null, "current_fixed_ctc_lpa": number|null, "notice_period": string|null}

General rules:
- current_location: just the city. phone: digits only, no country code. total_experience_years: best estimate, may be a decimal.
- languages_known: only if the resume explicitly states them.
- Use null / [] for anything not clearly supported by the resume. Never guess.

Classification rules (these must line up with a registration form, so use the allowed values EXACTLY as written):
- ${categoryRule}
- ${sellsRule}
- B2B allowed values: ${JSON.stringify(B2B_SELLS)}
- B2C allowed values: ${JSON.stringify(B2C_SELLS)}
- "sells_before": what they sold in EARLIER roles, from the same allowed list for the category, excluding anything already in sells_now. Up to 4.
- "role_level": one of ${JSON.stringify(LEVELS)} (SDR/BDR level = "IC – Sales Development", account executive = "IC – Account Executive", senior individual seller = "IC", etc.), judged from their latest title.
- "team_size": only if they lead a team and a number is stated; one of ${JSON.stringify(teamSizeBands)}; else null.
- "industries": industries they have sold INTO (their customers' industries), up to 8, copied EXACTLY from: ${JSON.stringify(INDUSTRIES)}
- "customer_segments": only for B2B, from ${JSON.stringify(customerSegmentOptions)}, based on who they sold to.
- "tools": CRM or sales tools named in the resume (Salesforce, HubSpot, Zoho, Sales Navigator, ...). Free text, up to 10.
- "skills": up to 10 core sales/professional skills named in the resume. Free text.
- "current_industry": one value from the industries list for their current employer's industry, else null.
- "highest_qualification": e.g. "MBA", "B.Tech", "BBA", "B.Com", else null.
- "current_fixed_ctc_lpa": only if the resume explicitly states current fixed CTC; convert to lakhs per annum. Else null.
- "notice_period": only if explicitly stated, else null.

Resume text:
${resumeText.slice(0, 14000)}`;

  try {
    const { text: raw } = await generateTextWithFallback(prompt, { json: true, thinkingBudget: 512 });
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

    const category = hint.category ?? (typeof parsed.category === "string" && CATEGORIES.includes(parsed.category) ? parsed.category : null);
    const sellsAllowed = category === "b2c_sales" ? B2C_SELLS : category === "b2b_sales" ? B2B_SELLS : [];
    let sellsNow = keepAllowed(parsed.sells_now, sellsAllowed, 3);
    if (hint.sells) sellsNow = [hint.sells, ...sellsNow.filter((x) => x !== hint.sells)].slice(0, 3);
    const sellsBefore = keepAllowed(parsed.sells_before, sellsAllowed, 4).filter((x) => !sellsNow.includes(x));
    const level = typeof parsed.role_level === "string" && LEVELS.includes(parsed.role_level) ? parsed.role_level : null;
    const leads = yourLevelOptions.find((l) => l.value === level)?.lead ?? false;
    const teamSize = leads && typeof parsed.team_size === "string" && teamSizeBands.includes(parsed.team_size) ? parsed.team_size : null;
    const ctc = typeof parsed.current_fixed_ctc_lpa === "number" && parsed.current_fixed_ctc_lpa > 0.5 && parsed.current_fixed_ctc_lpa <= 120 ? parsed.current_fixed_ctc_lpa : null;
    const freeList = (v: unknown, max: number) =>
      Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))).slice(0, max) : [];

    return {
      full_name: str(parsed.full_name),
      email: typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : null,
      phone: typeof parsed.phone === "string" ? normalizePhone(parsed.phone) : null,
      current_location: str(parsed.current_location),
      current_employer: str(parsed.current_employer),
      current_job_title: str(parsed.current_job_title),
      total_experience_years: typeof parsed.total_experience_years === "number" ? parsed.total_experience_years : null,
      languages_known: freeList(parsed.languages_known, 8),
      category,
      sells_now: sellsNow,
      sells_before: sellsBefore,
      role_level: level,
      team_size: teamSize,
      industries: keepAllowed(parsed.industries, INDUSTRIES, 8),
      customer_segments: category === "b2b_sales" ? keepAllowed(parsed.customer_segments, customerSegmentOptions, 6) : [],
      tools: freeList(parsed.tools, 10),
      skills: freeList(parsed.skills, 10),
      current_industry: typeof parsed.current_industry === "string" && INDUSTRIES.includes(parsed.current_industry) ? parsed.current_industry : null,
      highest_qualification: str(parsed.highest_qualification),
      linkedin_url: str(parsed.linkedin_url),
      current_fixed_ctc: ctc,
      notice_period: str(parsed.notice_period),
    };
  } catch (err) {
    console.error("bulk-extract failed on every configured AI provider", err);
    return null;
  }
}
