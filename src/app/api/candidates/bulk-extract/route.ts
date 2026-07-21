import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { extractResumeText } from "@/lib/resume-text";

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
  if (!profile || !["admin", "recruiter"].includes(profile.role)) {
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

  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

  const results: BulkExtractResult[] = [];
  for (const file of files) {
    results.push(await processOne(file, admin, genAI));
  }

  return NextResponse.json({ results });
}

async function processOne(file: File, admin: SupabaseClient, genAI: GoogleGenerativeAI | null): Promise<BulkExtractResult> {
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

    const extracted = await extractFieldsWithGemini(resumeText, genAI);
    if (!extracted) {
      return {
        fileName,
        ok: true,
        resumeFileUrl: path,
        extracted: {
          full_name: null,
          email: null,
          phone: null,
          current_location: null,
          current_employer: null,
          current_job_title: null,
          total_experience_years: null,
          languages_known: [],
        },
        duplicate: null,
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
      if (existing) duplicate = { candidateId: existing.id, fullName: existing.full_name };
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

async function extractFieldsWithGemini(resumeText: string, genAI: GoogleGenerativeAI | null) {
  if (!genAI) return null;

  const prompt = `Extract this candidate's identity/contact details from the resume text below. Return ONLY a JSON object (no markdown fence, no commentary), shaped exactly like:
{"full_name": "..." | null, "email": "..." | null, "phone": "..." | null, "current_location": "..." | null, "current_employer": "..." | null, "current_job_title": "..." | null, "total_experience_years": number | null, "languages_known": ["..."]}

Rules:
- current_location should be just the city name (e.g. "Bangalore"), not a full address.
- phone should be digits only, no country code prefix, no spaces/dashes.
- total_experience_years is your best estimate of total professional experience in years (a number, can be a decimal like 5.5), or null if you can't tell.
- languages_known: only include a language if the resume explicitly states it (a "Languages" section, "fluent in X", etc.) -- do not guess from the candidate's name or location. Return [] if none are stated.
- If a field truly cannot be determined, use null (or [] for languages_known) rather than guessing.

Resume text:
${resumeText.slice(0, 12000)}`;

  const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];
  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const raw = result.response.text().trim();
      const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(cleaned) as Record<string, unknown>;
      return {
        full_name: typeof parsed.full_name === "string" ? parsed.full_name.trim() : null,
        email: typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : null,
        phone: typeof parsed.phone === "string" ? normalizePhone(parsed.phone) : null,
        current_location: typeof parsed.current_location === "string" ? parsed.current_location.trim() : null,
        current_employer: typeof parsed.current_employer === "string" ? parsed.current_employer.trim() : null,
        current_job_title: typeof parsed.current_job_title === "string" ? parsed.current_job_title.trim() : null,
        total_experience_years: typeof parsed.total_experience_years === "number" ? parsed.total_experience_years : null,
        languages_known: Array.isArray(parsed.languages_known)
          ? parsed.languages_known.filter((l): l is string => typeof l === "string")
          : [],
      };
    } catch (err) {
      console.error(`Gemini bulk-extract failed with model ${modelName}`, err);
      continue;
    }
  }
  return null;
}
