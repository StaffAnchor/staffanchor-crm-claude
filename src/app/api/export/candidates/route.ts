import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

// Mirrors the primary filter set used by candidates/[id]/page.tsx's `from`
// reconstruction -- not every one of the ~15 filters on the Candidates page
// (role_level, recruiter, mandate, etc.), but the ones recruiters actually
// reach for when handing a client an offline list. Capped at 5,000 rows,
// far above any realistic export size at current volumes.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Not signed in", { status: 401 });

  const params = req.nextUrl.searchParams;
  let query = supabase
    .from("candidates")
    .select(
      "candidate_number, full_name, email, phone, current_location, current_employer, current_job_title, category, sub_domain, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_employment_status, highest_qualification, status, current_industry, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const q = params.get("q");
  const category = params.get("category");
  const status = params.get("status");
  const minCtc = params.get("min_ctc");
  const maxCtc = params.get("max_ctc");
  const minExp = params.get("min_exp");
  const subDomain = params.get("sub_domain");
  const location = params.get("location");
  const currentIndustry = params.get("current_industry");
  const origin = params.get("origin");
  const incomplete = params.get("incomplete");
  const noticePeriod = params.get("notice_period");
  const recommendation = params.get("recommendation");

  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,current_employer.ilike.%${q}%`);
  if (category) query = query.eq("category", category);
  if (status) query = query.eq("status", status);
  if (minCtc) query = query.gte("current_fixed_ctc", Number(minCtc));
  if (maxCtc) query = query.lte("current_fixed_ctc", Number(maxCtc));
  if (minExp) query = query.gte("total_experience_years", Number(minExp));
  if (subDomain) query = query.eq("sub_domain", subDomain);
  if (location) query = query.ilike("current_location", `%${location}%`);
  if (currentIndustry) query = query.eq("current_industry", currentIndustry);
  if (origin) query = query.eq("created_by", origin);
  if (incomplete) query = query.in("status", ["awaiting_input", "lead"]);
  if (noticePeriod) query = query.eq("notice_period", noticePeriod);
  if (recommendation) query = query.eq("recruiter_assessment->>overall_recommendation", recommendation);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  const headers = [
    "Candidate #",
    "Name",
    "Email",
    "Phone",
    "Location",
    "Current Employer",
    "Current Title",
    "Function",
    "Primary Specialization",
    "Experience (yrs)",
    "Current CTC",
    "Expected CTC",
    "Notice Period",
    "Employment Status",
    "Highest Qualification",
    "Status",
    "Current Industry",
    "Added On",
  ];
  const rows = (data ?? []).map((c) => [
    c.candidate_number,
    c.full_name,
    c.email,
    c.phone,
    c.current_location,
    c.current_employer,
    c.current_job_title,
    c.category,
    c.sub_domain,
    c.total_experience_years,
    c.current_fixed_ctc,
    c.expected_fixed_ctc,
    c.notice_period,
    c.current_employment_status,
    c.highest_qualification,
    c.status,
    c.current_industry,
    c.created_at ? new Date(c.created_at).toLocaleDateString() : "",
  ]);

  const csv = toCsv(headers, rows);
  return csvResponse(`candidates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
