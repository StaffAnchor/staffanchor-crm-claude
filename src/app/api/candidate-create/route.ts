import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

// CRM equivalent of jobs-staffanchor-clean's /api/candidate-submit. The
// "Create candidate" page used to insert straight into `candidates` from the
// browser using the recruiter's own session; this route keeps that same
// recruiter-auth check but does the write server-side with the service-role
// key so it can also create/link a real auth.users account for the
// candidate and (since this is Recruiter Created, no candidate consent
// needed) always send a branded welcome email with their profile-completion
// score and a magic-link login.
export async function POST(req: NextRequest) {
  // ---- Recruiter auth check, same pattern as /api/send-invite ----
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).single();
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

  let body: { candidate?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const candidateFields = body.candidate;
  if (!candidateFields || typeof candidateFields !== "object") {
    return NextResponse.json({ error: "candidate is required." }, { status: 400 });
  }
  const email = typeof candidateFields.email === "string" ? candidateFields.email.trim() : "";
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const admin = createSupabaseClient(supabaseUrl, serviceKey);

  try {
    const existingUser = await findAuthUserByEmail(admin, email);
    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (createError || !created?.user) {
        throw new Error(createError?.message ?? "Could not create an account for this email.");
      }
      userId = created.user.id;
    }

    const { data: inserted, error: insertError } = await admin
      .from("candidates")
      .insert({ ...candidateFields, created_by_user: user.id })
      .select("id")
      .single();
    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? "Could not save this candidate.");
    }
    const candidateId = inserted.id as string;

    const { error: linkError } = await admin.from("candidates").update({ user_id: userId }).eq("id", candidateId);
    if (linkError) {
      console.error("Failed to link candidates.user_id after recruiter-created candidate", linkError);
    }

    // Recruiter Created candidates get a welcome + login email every time
    // (no consent gate, per product decision) -- unlike the self-service
    // candidate-submit route, this isn't conditional on isNewSignup.
    const fullName = typeof candidateFields.full_name === "string" ? candidateFields.full_name : "there";
    const completionScore = computeProfileCompletionScore(candidateFields);
    const segmentData = candidateFields.segment_data as { missing_fields?: unknown } | null | undefined;
    const missingFields = Array.isArray(segmentData?.missing_fields)
      ? segmentData!.missing_fields.filter((f): f is string => typeof f === "string")
      : [];
    await sendRecruiterCreatedWelcomeEmail(admin, email, fullName, completionScore, missingFields).catch((err) => {
      console.error("Failed to send recruiter-created welcome email", err);
    });

    return NextResponse.json({ candidateId, isNewSignup: !existingUser });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Same judgment call as jobs-staffanchor-clean's /api/candidate-submit: this
// supabase-js version's admin.listUsers() has no email-filter param, so we
// page through results looking for a case-insensitive match.
async function findAuthUserByEmail(admin: SupabaseClient, email: string) {
  const target = email.toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match;
    if (data.users.length < perPage) break;
  }
  return null;
}

// Simple heuristic, not a port of ApplyForm.tsx's full weighted profileStrength
// calc (that one depends on a large chunk of client-only wizard state --
// career timeline entries, segment_data sub-fields, etc. -- that isn't
// reachable from this route). Instead: an even weighting across the core
// fields this "Create candidate" form actually collects, so a freshly
// recruiter-created profile gets a meaningful, honest starting percentage
// that then climbs as the candidate fills in the rest via their magic link.
const COMPLETION_FIELDS = [
  "full_name",
  "email",
  "phone",
  "city",
  "current_location",
  "category",
  "sub_domain",
  "current_fixed_ctc",
  "total_experience_years",
  "notice_period",
  "current_job_title",
  "current_employer",
  "current_employment_status",
  "current_industry",
  "resume_file_url",
] as const;

function computeProfileCompletionScore(fields: Record<string, unknown>): number {
  const filled = COMPLETION_FIELDS.filter((key) => {
    const value = fields[key];
    return value !== null && value !== undefined && value !== "";
  }).length;
  return Math.round((filled / COMPLETION_FIELDS.length) * 100);
}

// Human labels for segment_data.missing_fields entries -- same vocabulary
// as the Create Candidate form's skip checkboxes and send-invite's
// analogous tweak, so a candidate sees consistent wording no matter which
// email actually reaches them first.
const MISSING_FIELD_LABELS: Record<string, string> = {
  sub_domain: "your practice / vertical / function",
  current_employer: "your current employer",
  current_job_title: "your current job title",
  current_employment_status: "your employment status",
  current_industry: "your current industry",
  total_experience_years: "your total experience",
  current_fixed_ctc: "your current fixed CTC",
  expected_fixed_ctc: "your expected fixed CTC",
  notice_period: "your notice period / days to join",
  role_type: "whether you're an IC or leading a team",
  highest_qualification: "your highest qualification",
  work_mode: "your preferred work mode",
  open_to_relocation: "whether you're open to relocation",
  resume: "your resume",
};

async function sendRecruiterCreatedWelcomeEmail(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  completionScore: number,
  missingFields: string[] = []
) {
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.error("GMAIL_USER / GMAIL_APP_PASSWORD not configured -- skipping recruiter-created welcome email");
    return;
  }

  // Matches jobs.staffanchor.com's candidate-login page redirect target so a
  // recruiter-created candidate's magic link lands in the same place any
  // other candidate's does.
  const redirectTo = `${process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com"}/candidate-portal`;
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  if (error || !data?.properties?.action_link) {
    throw new Error(error?.message ?? "Could not generate a magic-link login link.");
  }
  const actionLink = data.properties.action_link;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const firstName = fullName.split(" ")[0] || "there";
  const missingFieldText =
    missingFields.length > 0
      ? ` Specifically, we still need: ${missingFields.map((f) => MISSING_FIELD_LABELS[f] ?? f).join(", ")}.`
      : "";
  const subject = "A recruiter started your StaffAnchor profile — here's what's next";
  const text = `Hi ${firstName},\n\nA StaffAnchor recruiter has started a profile for you so we can match you to the right sales roles.${missingFieldText}\n\nYour profile is currently ${completionScore}% complete. Sign in below to review it, add the rest of your details, and start hearing about relevant openings:\n\n${actionLink}\n\nNo password needed -- that link logs you straight in.\n\nThanks,\nStaffAnchor Team`;
  const html = `<p>Hi ${firstName},</p><p>A StaffAnchor recruiter has started a profile for you so we can match you to the right sales roles.${missingFieldText}</p><p>Your profile is currently <strong>${completionScore}% complete</strong>. Sign in below to review it, add the rest of your details, and start hearing about relevant openings:</p><p><a href="${actionLink}">${actionLink}</a></p><p>No password needed — that link logs you straight in.</p><p>Thanks,<br/>StaffAnchor Team</p>`;

  await transporter.sendMail({
    from: `"StaffAnchor" <${gmailUser}>`,
    to: email,
    subject,
    text,
    html,
  });
}
