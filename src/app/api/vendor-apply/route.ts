import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

// Public, unauthenticated submission endpoint for vendors.staffanchor.com --
// same class of self-authorizing public route as api/vendor-signup/[token]
// (see middleware.ts isPublicRoute): there's no staff cookie and no vendor
// account yet, just a form anyone on the internet can submit. Uses the
// service-role client throughout (not the cookie-based server client) so
// the resume upload and table insert both bypass RLS from the server side
// rather than needing an anon-key storage policy on the resumes bucket.
function adminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return null;
  return createSupabaseClient(supabaseUrl, serviceKey);
}

const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8MB -- generous for a PDF resume,
// small enough to reject anything that's obviously not a resume.

export async function POST(req: NextRequest) {
  const admin = adminClient();
  if (!admin) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const form = await req.formData();

  const fullName = String(form.get("fullName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const linkedinUrl = String(form.get("linkedinUrl") ?? "").trim();
  const currentLocation = String(form.get("currentLocation") ?? "").trim();
  const totalExperienceYears = form.get("totalExperienceYears");
  const b2bSalesHiringExperienceYears = form.get("b2bSalesHiringExperienceYears");
  const enterpriseSalesHiringExperienceYears = form.get("enterpriseSalesHiringExperienceYears");
  const rolesHiredFor = form.getAll("rolesHiredFor").map(String).filter(Boolean);
  const industriesHiredFor = form.getAll("industriesHiredFor").map(String).filter(Boolean);
  const linkedinConnectionsBand = String(form.get("linkedinConnectionsBand") ?? "").trim();
  const hasLinkedinRecruiterOrNavigator = form.get("hasLinkedinRecruiterOrNavigator");
  const hasJobPortalAccess = form.get("hasJobPortalAccess");
  const interestedInPaidJobPortalAccess = form.get("interestedInPaidJobPortalAccess");
  const expectedHoursPerWeek = String(form.get("expectedHoursPerWeek") ?? "").trim();
  const languagesKnown = form.getAll("languagesKnown").map(String).filter(Boolean);
  const availableToStart = String(form.get("availableToStart") ?? "").trim();
  const additionalNotes = String(form.get("additionalNotes") ?? "").trim();
  const consent = form.get("consent");
  const resumeFile = form.get("resume");

  if (!fullName || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }
  if (!consent || consent !== "true") {
    return NextResponse.json({ error: "Please accept the consent checkbox to continue." }, { status: 400 });
  }
  if (!(resumeFile instanceof File) || resumeFile.size === 0) {
    return NextResponse.json({ error: "Please attach your resume." }, { status: 400 });
  }
  if (resumeFile.size > MAX_RESUME_BYTES) {
    return NextResponse.json({ error: "Resume file is too large (max 8MB)." }, { status: 400 });
  }
  if (resumeFile.type !== "application/pdf" && !resumeFile.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Please upload your resume as a PDF." }, { status: 400 });
  }

  const safeName = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "applicant";
  const resumePath = `vendor-applications/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName}.pdf`;

  const bytes = new Uint8Array(await resumeFile.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("resumes").upload(resumePath, bytes, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: `Resume upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const toNumOrNull = (v: FormDataEntryValue | null) => {
    const n = Number(v);
    return v && !Number.isNaN(n) ? n : null;
  };

  const { error: insertError } = await admin.from("vendor_applications").insert({
    full_name: fullName,
    email,
    phone: phone || null,
    linkedin_url: linkedinUrl || null,
    current_location: currentLocation || null,
    total_experience_years: toNumOrNull(totalExperienceYears),
    b2b_sales_hiring_experience_years: toNumOrNull(b2bSalesHiringExperienceYears),
    enterprise_sales_hiring_experience_years: toNumOrNull(enterpriseSalesHiringExperienceYears),
    roles_hired_for: rolesHiredFor,
    industries_hired_for: industriesHiredFor,
    linkedin_connections_band: linkedinConnectionsBand || null,
    has_linkedin_recruiter_or_navigator: hasLinkedinRecruiterOrNavigator === "true",
    has_job_portal_access: hasJobPortalAccess === "true",
    interested_in_paid_job_portal_access: interestedInPaidJobPortalAccess === "true",
    expected_hours_per_week: expectedHoursPerWeek || null,
    languages_known: languagesKnown,
    available_to_start: availableToStart || null,
    resume_file_path: resumePath,
    additional_notes: additionalNotes || null,
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
