import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Submit a referral (role-linked or bench). Two clients used deliberately:
// the cookie-authed server client to confirm who's signed in and to do the
// actual insert (RLS's sales_circle_referrals_self_insert policy already
// scopes that to the caller's own referrer_id), and a service-role client
// for the duplicate-ownership check and the resume upload -- the duplicate
// check has to see across ALL referrers' submissions (RLS would otherwise
// hide every other referrer's rows), and the resumes bucket has no
// referrer-facing storage policy (same pattern as vendor-apply/route.ts),
// so the upload goes through the service-role client from the server side.
//
// Duplicate rule per spec: if the same candidate (by phone/email/LinkedIn)
// was already submitted by anyone within the last 6 months, the new
// submission is blocked with a neutral message -- first valid submission
// timestamp determines ownership, so this referrer isn't told who has it or
// why, just that it's unavailable.
const OWNERSHIP_WINDOW_DAYS = 180;
const MAX_RESUME_BYTES = 8 * 1024 * 1024; // 8MB, matches vendor-apply's limit

const VALID_SALES_EXPERIENCE = ["b2b_sales", "b2c_sales", "both", "neither"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, sales_circle_referrer_id")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "referrer" || !profile.sales_circle_referrer_id) {
    return NextResponse.json({ error: "Not permitted" }, { status: 403 });
  }

  const form = await req.formData();
  const str = (key: string) => String(form.get(key) ?? "").trim();

  const candidateName = str("candidateName");
  const candidatePhone = str("candidatePhone");
  const candidateEmail = str("candidateEmail");
  const candidateLinkedinUrl = str("candidateLinkedinUrl");
  const candidateCurrentCompany = str("candidateCurrentCompany");
  const candidateCurrentDesignation = str("candidateCurrentDesignation");
  const whyFit = str("whyFit");
  const mandateId = str("mandateId") || null;
  const consentConfirmed = str("consentConfirmed") === "true";

  const salesExperienceRaw = str("salesExperience");
  const candidateSalesExperience = VALID_SALES_EXPERIENCE.includes(salesExperienceRaw) ? salesExperienceRaw : null;
  const experienceYearsRaw = str("experienceYears");
  const candidateTotalExperienceYears = experienceYearsRaw && !Number.isNaN(Number(experienceYearsRaw)) ? Number(experienceYearsRaw) : null;
  const expectedCtcRaw = str("expectedCtc");
  const candidateExpectedCtc = expectedCtcRaw && !Number.isNaN(Number(expectedCtcRaw)) ? Number(expectedCtcRaw) : null;
  const candidateNoticePeriod = str("noticePeriod") || null;

  const resumeFile = form.get("resume");

  if (!candidateName) {
    return NextResponse.json({ error: "Candidate name is required." }, { status: 400 });
  }
  if (!candidatePhone && !candidateEmail && !candidateLinkedinUrl) {
    return NextResponse.json({ error: "Provide at least a phone, email, or LinkedIn URL for the candidate." }, { status: 400 });
  }
  if (!consentConfirmed) {
    return NextResponse.json(
      { error: "Please confirm the candidate knows you're recommending them and agrees to be contacted." },
      { status: 400 }
    );
  }
  if (resumeFile instanceof File && resumeFile.size > 0) {
    if (resumeFile.size > MAX_RESUME_BYTES) {
      return NextResponse.json({ error: "Resume file is too large (max 8MB)." }, { status: 400 });
    }
    if (resumeFile.type !== "application/pdf" && !resumeFile.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Please upload the resume as a PDF." }, { status: 400 });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = serviceKey ? createSupabaseClient(supabaseUrl, serviceKey) : null;

  if (admin) {
    const cutoff = new Date(Date.now() - OWNERSHIP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const orParts: string[] = [];
    if (candidatePhone) orParts.push(`candidate_phone.ilike.${candidatePhone}`);
    if (candidateEmail) orParts.push(`candidate_email.ilike.${candidateEmail}`);
    if (candidateLinkedinUrl) orParts.push(`candidate_linkedin_url.ilike.${candidateLinkedinUrl}`);

    if (orParts.length > 0) {
      const { data: existing } = await admin
        .from("sales_circle_referrals")
        .select("id, created_at")
        .or(orParts.join(","))
        .gte("created_at", cutoff)
        .is("pii_deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json(
          {
            error:
              "This candidate has already been referred recently and can't be submitted again right now. If you believe this is a mistake, reach out to your StaffAnchor contact.",
          },
          { status: 409 }
        );
      }
    }
  }

  let resumeFilePath: string | null = null;
  if (admin && resumeFile instanceof File && resumeFile.size > 0) {
    const safeName = candidateName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40) || "referral";
    const path = `sales-circle-referrals/${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeName}.pdf`;
    const bytes = new Uint8Array(await resumeFile.arrayBuffer());
    const { error: uploadError } = await admin.storage.from("resumes").upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: `Resume upload failed: ${uploadError.message}` }, { status: 500 });
    }
    resumeFilePath = path;
  }

  const { data: inserted, error: insertError } = await supabase
    .from("sales_circle_referrals")
    .insert({
      referrer_id: profile.sales_circle_referrer_id,
      mandate_id: mandateId,
      candidate_name: candidateName,
      candidate_phone: candidatePhone || null,
      candidate_email: candidateEmail || null,
      candidate_linkedin_url: candidateLinkedinUrl || null,
      candidate_current_company: candidateCurrentCompany || null,
      candidate_current_designation: candidateCurrentDesignation || null,
      why_fit: whyFit || null,
      consent_confirmed: true,
      resume_file_path: resumeFilePath,
      candidate_sales_experience: candidateSalesExperience,
      candidate_total_experience_years: candidateTotalExperienceYears,
      candidate_expected_ctc: candidateExpectedCtc,
      candidate_notice_period: candidateNoticePeriod,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json({ error: insertError?.message ?? "Failed to submit referral" }, { status: 500 });
  }

  // Uses the service-role client, not the cookie-authed one -- referrers
  // have a select-only RLS policy on referral_status_history (see the
  // migration), no insert policy, since normally only staff write history
  // rows when they change a referral's status. This one initial "submitted"
  // row is the one exception, logged server-side rather than opening up
  // client-side insert access for referrers more broadly.
  if (admin) {
    await admin.from("sales_circle_referral_status_history").insert({
      referral_id: inserted.id,
      from_status: null,
      to_status: "submitted",
      changed_by: user.id,
    });
  }

  return NextResponse.json({ ok: true, referralId: inserted.id });
}
