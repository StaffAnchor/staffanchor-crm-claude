import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { extractFieldsWithGemini, type ExtractedCvFields } from "@/lib/cv-profile-extract";
import { extractResumeText } from "@/lib/resume-text";
import { logTimeSaved } from "@/lib/time-saved";

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
// The page sends a few CVs per request (to stay under the request size limit), so
// this is the cap for one request, not for one upload.
const MAX_FILES = 10;
const CONCURRENCY = 3;
export const maxDuration = 300;

export type BulkExtractResult = {
  fileName: string;
  ok: boolean;
  error?: string;
  resumeFileUrl?: string;
  extracted?: ExtractedCvFields;
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
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const chunk = files.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(chunk.map((file) => processOne(file, admin, aiConfigured, user.id, hint)))));
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
