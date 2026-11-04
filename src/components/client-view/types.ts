// Shapes returned by get_my_client_overview() and get_my_client_role_board().

export type OverviewMandate = {
  id: string;
  role_title: string;
  category: string | null;
  sub_domain: string | null;
  city: string | null;
  status: string;
  experience_min: number | null;
  experience_max: number | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  headcount: number | null;
  created_at: string;
  shortlisted: number;
  to_review: number;
  interested: number;
  interviewing: number;
  hired: number;
};

export type UpcomingInterview = {
  link_id: string;
  mandate_id: string;
  role_title: string;
  full_name: string;
  at: string;
  confirmed: boolean;
};

export type ClientOverview = { mandates: OverviewMandate[]; upcoming: UpcomingInterview[] };

export type Role = {
  id: string;
  role_title: string;
  category: string | null;
  sub_domain: string | null;
  sub_domains: string[] | null;
  city: string | null;
  cities: string[] | null;
  experience_min: number | null;
  experience_max: number | null;
  budget_min: number | string | null;
  budget_max: number | string | null;
  must_haves: string[] | null;
  good_to_haves: string[] | null;
  work_mode: string | null;
  status: string;
  headcount: number | null;
  created_at: string;
  selling_style: string | null;
  industries_sold_to: string[] | null;
};

export type CvRole = {
  title?: string | null;
  company?: string | null;
  start?: string | null;
  end?: string | null;
  is_current?: boolean | null;
  sells?: string | null;
  motion?: string | null;
  buyers?: string[] | null;
  deal_size?: string | null;
  quota_or_target?: string | null;
  achievement?: string | null;
  evidence?: string | null;
  industry?: string | null;
};

export type TimelineEntry = {
  title?: string | null;
  company?: string | null;
  start_month?: string | null;
  end_month?: string | null;
  description?: string | null;
};

export type AiCheck = { requirement: string; status: "met" | "doubt"; evidence: string | null; question: string | null };

export type BoardCandidate = {
  link_id: string;
  candidate_id: string;
  full_name: string;
  current_job_title: string | null;
  current_employer: string | null;
  current_location: string | null;
  total_experience_years: number | string | null;
  current_fixed_ctc?: number | string | null;
  expected_fixed_ctc: number | string | null;
  notice_period: string | null;
  verified_notice: string | null;
  verified_relocation: string | null;
  recommendation: string | null;
  open_to_relocation: string | null;
  work_mode: string | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  industries: string[] | null;
  ai_summary: string | null;
  ai_passport: { headline?: string; resume_highlights?: string[] } | null;
  resume_file_url: string | null;
  stage: string;
  stage_updated_at: string | null;
  shortlisted_at: string | null;
  client_feedback: string | null;
  client_pass_reason?: string | null;
  client_pass_note?: string | null;
  // Why and from where a candidate was turned down, so "passed on the CV" can be told from "not selected after an interview".
  rejected_from_stage?: string | null;
  stage_source?: string | null;
  rejection_category?: string | null;
  // A note from the StaffAnchor recruiter about this candidate, written when sharing.
  client_note?: string | null;
  requested_interview_at: string | null;
  confirmed_interview_at: string | null;
  selling: {
    quota?: string;
    team_quota?: string;
    deal_size?: string;
    deal_size_currency?: string;
    ticket?: string;
    ticket_currency?: string;
    style?: string;
    motion?: string[];
    revenue_snapshot?: { target?: string; target_currency?: string; achievement?: string };
    crm_tools?: string[];
    role_level?: string;
    team_size?: string;
    customer_segment_sold?: string[];
    sells_now?: string[];
  } | null;
  cv_roles: CvRole[] | null;
  cv_tools: string[] | null;
  cv_education: unknown;
  cv_certifications: string[] | null;
  career_timeline: TimelineEntry[] | null;
  ai_checks: { must: AiCheck[]; good: AiCheck[] } | null;
  // The recruiter's own review of each requirement the client set, including any not met.
  share_review: {
    requirements: { requirement: string; kind: "must" | "good"; status: "met" | "partial" | "not_met"; note?: string }[];
    reviewed_at?: string | null;
    reviewer_name?: string | null;
  } | null;
  confirmed_on_call_at: string | null;
};

export type RoleBoard = { role: Role; candidates: BoardCandidate[] };

export type FeedbackValue = "interested" | "interview_requested" | "not_interested";
