import { NextRequest } from "next/server";
import { corsJson, corsPreflight, requireExtensionUser } from "@/lib/extension-auth";
import { generateAiPassportForCandidate } from "@/lib/ai-passport";
import { waitUntil } from "@vercel/functions";

export const runtime = "nodejs";

// Saves a candidate captured by the Chrome extension's LinkedIn "Save to
// StaffAnchor" button. Deliberately much simpler than /api/candidate-create:
// a scraped LinkedIn profile almost never exposes an email or phone number,
// so this never tries to create/link a candidate auth.users account or
// send a welcome email -- it just lands the row as status='lead' with
// category/email/phone left blank, owned by the capturing recruiter, ready
// for that recruiter to reach out and complete the profile the normal way
// (the existing Edit/Complete Profile flow already highlights exactly
// what's missing).
export async function OPTIONS() {
  return corsPreflight();
}

type LinkedInExperience = { title?: string; company?: string; dateRange?: string };
type LinkedInEducation = { school?: string; degree?: string; dateRange?: string };

export async function POST(req: NextRequest) {
  const auth = await requireExtensionUser(req);
  if ("error" in auth) return auth.error;
  const { user, admin } = auth;

  let body: {
    fullName?: string;
    headline?: string;
    currentJobTitle?: string;
    currentEmployer?: string;
    location?: string;
    linkedinUrl?: string;
    skills?: string[];
    experience?: LinkedInExperience[];
    education?: LinkedInEducation[];
  };
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid request body." }, { status: 400 });
  }

  const fullName = (body.fullName ?? "").trim();
  const linkedinUrl = (body.linkedinUrl ?? "").trim();
  if (!fullName) return corsJson({ error: "Couldn't read a name off this profile." }, { status: 400 });
  if (!linkedinUrl) return corsJson({ error: "Couldn't read this profile's LinkedIn URL." }, { status: 400 });

  // Re-check for a duplicate server-side too (not just relying on the
  // extension having called /lookup-candidate first) -- avoids a race, and
  // avoids silently creating a second row if the extension's lookup step
  // was skipped or failed.
  const { data: existing } = await admin.from("candidates").select("id, owner_id").eq("linkedin_url", linkedinUrl).maybeSingle();
  if (existing) {
    let ownerName: string | null = null;
    if (existing.owner_id) {
      const { data: ownerProfile } = await admin.from("profiles").select("full_name, email").eq("id", existing.owner_id).maybeSingle();
      ownerName = ownerProfile?.full_name ?? ownerProfile?.email ?? null;
    }
    return corsJson({ duplicate: true, candidateId: existing.id, ownerName }, { status: 409 });
  }

  const segmentData: Record<string, unknown> = {};
  if (body.headline) segmentData.linkedin_headline = body.headline;
  if (body.experience?.length) segmentData.linkedin_experience = body.experience;
  if (body.education?.length) segmentData.linkedin_education = body.education;

  const { data: inserted, error: insertError } = await admin
    .from("candidates")
    .insert({
      full_name: fullName,
      current_job_title: body.currentJobTitle?.trim() || body.headline?.trim() || null,
      current_employer: body.currentEmployer?.trim() || null,
      current_location: body.location?.trim() || null,
      linkedin_url: linkedinUrl,
      skills: body.skills?.length ? body.skills.join(", ") : null,
      segment_data: Object.keys(segmentData).length ? segmentData : null,
      status: "lead",
      created_by: "browser_extension",
      created_by_user: user.id,
      owner_id: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    // Most likely cause: the email-uniqueness constraint doesn't apply here
    // (no email sent), but a stale linkedin_url unique index or similar
    // could still fire under a race -- surface it rather than swallowing it.
    return corsJson({ error: insertError?.message ?? "Could not save this candidate." }, { status: 500 });
  }
  const candidateId = inserted.id as string;

  // Fire-and-forget AI passport generation, same waitUntil pattern as
  // candidate-create -- a Vercel serverless invocation can freeze the
  // instant the response is sent, so this must be registered explicitly to
  // keep running past that point rather than risk silently never
  // completing.
  waitUntil(
    generateAiPassportForCandidate(candidateId, admin, { note: "auto_generated_on_extension_capture" }).catch((err) =>
      console.error("Auto AI passport generation failed for extension-captured candidate", candidateId, err)
    )
  );

  return corsJson({ candidateId });
}
