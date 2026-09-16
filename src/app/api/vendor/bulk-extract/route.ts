import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { generateTextWithFallback } from "@/lib/ai-providers";
import { extractResumeText } from "@/lib/resume-text";

export const runtime = "nodejs";

// Vendor bulk CV upload -- step 1 of 2, mirroring the internal
// /api/candidates/bulk-extract flow (extract-and-review, nothing written
// to `candidates` here). Restricted to freelancer accounts, and requires
// the mandate they're uploading against to be one they're actually
// assigned to -- step 2 (the vendor-candidates-bulk-upload-view client)
// calls vendor_submit_candidate() per confirmed row, which re-checks that
// assignment and stamps created_by/created_by_user so RLS scopes these
// candidates to this vendor alone, same as the single-candidate form.
// Duplicate detection is deliberately scoped to this vendor's OWN
// previously-submitted candidates only (never the full candidates table)
// -- a vendor should never learn whether some unrelated email address
// already exists in StaffAnchor's database.
const MAX_FILES = 10;

export type VendorBulkExtractResult = {
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
  if (profile?.role !== "freelancer") {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const formData = await req.formData();
  const mandateId = formData.get("mandateId");
  if (typeof mandateId !== "string" || !mandateId) {
    return NextResponse.json({ error: "Select a mandate to upload against first." }, { status: 400 });
  }
  const { data: assignment } = await supabase
    .from("mandate_assignments")
    .select("mandate_id")
    .eq("mandate_id", mandateId)
    .eq("freelancer_id", user.id)
    .maybeSingle();
  if (!assignment) {
    return NextResponse.json({ error: "You're not assigned to that mandate." }, { status: 403 });
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

  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files were uploaded." }, { status: 400 });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Upload at most ${MAX_FILES} resumes at a time.` }, { status: 400 });
  }

  const aiConfigured = !!(process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || process.env.MISTRAL_API_KEY);

  const results: VendorBulkExtractResult[] = [];
  for (const file of files) {
    results.push(await processOne(file, admin, aiConfigured, user.id));
  }

  return NextResponse.json({ results });
}

async function processOne(
  file: File,
  admin: SupabaseClient,
  aiConfigured: boolean,
  vendorUserId: string
): Promise<VendorBulkExtractResult> {
  const fileName = file.name;
  try {
    const buffer = await file.arrayBuffer();
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

    const extracted = await extractFieldsWithGemini(resumeText, aiConfigured);
    if (!extracted) {
      return {
        fileName,
        ok: false,
        error: "Couldn't extract fields from this resume automatically. Fill them in manually below.",
        resumeFileUrl: path,
      };
    }

    let duplicate: VendorBulkExtractResult["duplicate"] = null;
    if (extracted.email) {
      const { data: existing } = await admin
        .from("candidates")
        .select("id, full_name")
        .ilike("email", extracted.email)
        .eq("created_by_user", vendorUserId)
        .limit(1)
        .maybeSingle();
      if (existing) {
        duplicate = { candidateId: existing.id, fullName: existing.full_name };
      }
    }

    return { fileName, ok: true, resumeFileUrl: path, extracted, duplicate };
  } catch (err) {
    return { fileName, ok: false, error: err instanceof Error ? err.message : "Something went wrong." };
  }
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }
  return digits;
}

async function extractFieldsWithGemini(resumeText: string, aiConfigured: boolean) {
  if (!aiConfigured) return null;

  const prompt = `Extract this candidate's identity/contact details from the resume text below. Return ONLY a JSON object (no markdown fence, no commentary), shaped exactly like:
{"full_name": "..." | null, "email": "..." | null, "phone": "..." | null, "current_location": "..." | null, "current_employer": "..." | null, "current_job_title": "..." | null, "total_experience_years": number | null}

Rules:
- current_location should be just the city name (e.g. "Bangalore"), not a full address.
- phone should be digits only, no country code prefix, no spaces/dashes.
- total_experience_years is your best estimate of total professional experience in years (a number, can be a decimal like 5.5), or null if you can't tell.
- If a field truly cannot be determined, use null rather than guessing.

Resume text:
${resumeText.slice(0, 12000)}`;

  try {
    const { text: raw } = await generateTextWithFallback(prompt);
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
    };
  } catch (err) {
    console.error("vendor bulk-extract failed on every configured AI provider", err);
    return null;
  }
}
