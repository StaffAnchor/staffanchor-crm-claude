import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvResponse } from "@/lib/csv";

// Mirrors the primary filter set used by candidates/[id]/page.tsx's `from`
// reconstruction -- not every one of the ~15 filters on the Candidates page
// (role_level, recruiter, mandate, etc.), but the ones recruiters actually
// reach for when handing a client an offline list. Capped at 5,000 rows,
// far above any realistic export size at current volumes.

// Every optional column the export can include, keyed the same way the
// on-screen table's customizable-columns feature (candidates-table.tsx,
// COLUMN_DEFS) keys its own columns -- so the "cols" param below is just
// that table's current visible-column order, passed straight through. Export
// used to always emit one fixed default column set regardless of what the
// recruiter had actually customized the table to show/hide/reorder (gap #7,
// July 2026 audit): a recruiter who'd hidden CTC and added Role Level got a
// CSV with CTC in it and no Role Level. Candidate # and Name are always
// first regardless of "cols", since a row with neither is useless.
const OPTIONAL_COLUMNS: Record<string, { header: string; get: (c: Record<string, unknown>) => unknown }> = {
  email: { header: "Email", get: (c) => c.email },
  phone: { header: "Phone", get: (c) => c.phone },
  current_location: { header: "Location", get: (c) => c.current_location },
  current_employer: { header: "Current Employer", get: (c) => c.current_employer },
  current_job_title: { header: "Current Title", get: (c) => c.current_job_title },
  category: { header: "Function", get: (c) => c.category },
  sub_domain: { header: "Primary Specialization", get: (c) => c.sub_domain },
  total_experience_years: { header: "Experience (yrs)", get: (c) => c.total_experience_years },
  current_fixed_ctc: { header: "Current CTC", get: (c) => c.current_fixed_ctc },
  expected_fixed_ctc: { header: "Expected CTC", get: (c) => c.expected_fixed_ctc },
  notice_period: { header: "Notice Period", get: (c) => c.notice_period },
  current_employment_status: { header: "Employment Status", get: (c) => c.current_employment_status },
  highest_qualification: { header: "Highest Qualification", get: (c) => c.highest_qualification },
  status: { header: "Status", get: (c) => c.status },
  current_industry: { header: "Current Industry", get: (c) => c.current_industry },
  role_level: { header: "Role Level", get: (c) => c.role_level },
  role_type: { header: "Role Type", get: (c) => c.role_type },
  work_mode: { header: "Work Mode", get: (c) => c.work_mode },
  open_to_relocation: { header: "Open to Relocation", get: (c) => c.open_to_relocation },
  created_at: {
    header: "Added On",
    get: (c) => (c.created_at ? new Date(c.created_at as string).toLocaleDateString() : ""),
  },
};

// The full-superset default -- used whenever the request has no "cols" param
// (e.g. a bookmarked export link, or anything hitting this route directly),
// so existing behavior/links don't change.
const DEFAULT_COLUMN_ORDER = [
  "email",
  "phone",
  "current_location",
  "current_employer",
  "current_job_title",
  "category",
  "sub_domain",
  "total_experience_years",
  "current_fixed_ctc",
  "expected_fixed_ctc",
  "notice_period",
  "current_employment_status",
  "highest_qualification",
  "status",
  "current_industry",
  "created_at",
];

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
      "candidate_number, full_name, email, phone, current_location, current_employer, current_job_title, category, sub_domain, total_experience_years, current_fixed_ctc, expected_fixed_ctc, notice_period, current_employment_status, highest_qualification, status, current_industry, role_level, role_type, work_mode, open_to_relocation, created_at"
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
  const colsParam = params.get("cols");

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

  // Only recognize keys this route actually knows how to render -- an
  // unrecognized/columns-panel-only key (e.g. a scorecard sub-score) is
  // silently dropped rather than breaking the whole export.
  const requestedOrder = colsParam
    ? colsParam.split(",").filter((k) => OPTIONAL_COLUMNS[k])
    : DEFAULT_COLUMN_ORDER;
  const columnOrder = requestedOrder.length > 0 ? requestedOrder : DEFAULT_COLUMN_ORDER;

  const headers = ["Candidate #", "Name", ...columnOrder.map((k) => OPTIONAL_COLUMNS[k].header)];
  const rows = (data ?? []).map((c) => [
    c.candidate_number,
    c.full_name,
    ...columnOrder.map((k) => OPTIONAL_COLUMNS[k].get(c as Record<string, unknown>)),
  ]);

  const csv = toCsv(headers, rows);
  return csvResponse(`candidates-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
