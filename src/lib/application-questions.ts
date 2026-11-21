// The questions a candidate answers when applying (table mandate_screening_questions). Kept short and friendly: the basics a recruiter
// always needs come first and are required; the few questions taken from the job description come after, optional, so applying stays
// quick and nobody is put off.
//
// The wording of the basics matters. A database trigger (apply_application_answer_to_profile) reads the question text to copy the answer
// onto the candidate's profile: "current ... fixed CTC" saves current pay, "how soon ... join" saves the notice period. Keep those words.

export type ApplyType = "short_answer" | "yes_no" | "numeric";

export const APPLY_TYPE_LABEL: Record<ApplyType, string> = { short_answer: "Short answer (text)", yes_no: "Yes / No", numeric: "Number" };

export type GeneratedQuestion = { question_text: string; answer_type: ApplyType; is_required: boolean; kind: "basic" | "jd" };

/** The same question written two ways counts once. */
export const normQuestion = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

export type ApplyContext = {
  role_title: string;
  category?: string | null;
  sub_domains?: string[];
  must_haves?: string[];
  good_to_haves?: string[];
  cities?: string[];
  work_mode?: string | null;
  working_days?: string | null;
  shift_timing?: string | null;
  requires_own_device?: boolean;
  jd_overview?: string | null;
  jd_candidate_profile?: string | null;
  sales_cycle?: string | null;
  deal_size_band?: string | null;
};

/** The basics, in this order: pay, place and days, working now, how soon they can join. Built from the role itself, no AI. */
export function basicApplicationQuestions(ctx: ApplyContext): GeneratedQuestion[] {
  const place = (ctx.cities ?? []).filter(Boolean).slice(0, 2).join(" or ");
  const office = place ? `the ${place} office` : "the office";
  const days = (ctx.working_days ?? "").trim();
  const shift = ctx.shift_timing && ctx.shift_timing !== "General shift" && ctx.shift_timing !== "Day shift" ? ctx.shift_timing : "";
  const extra = [days, shift].filter(Boolean).join(", ");
  const where = !ctx.work_mode
    ? "with the work location and working days for this role"
    : ctx.work_mode === "Remote"
      ? "working remotely"
      : ctx.work_mode === "Hybrid"
        ? `working in a hybrid setup, coming to ${office}`
        : `working from ${office}`;
  const out: GeneratedQuestion[] = [
    { question_text: "What is your current fixed CTC? (in LPA, for example 6.5)", answer_type: "numeric", is_required: true, kind: "basic" },
    { question_text: `Are you comfortable ${where}${extra ? ` (${extra})` : ""}?`, answer_type: "yes_no", is_required: true, kind: "basic" },
    { question_text: "Are you currently working?", answer_type: "yes_no", is_required: true, kind: "basic" },
    { question_text: "How soon can you join if you are selected? (number of days, 0 if immediately)", answer_type: "numeric", is_required: true, kind: "basic" },
  ];
  if (ctx.requires_own_device) out.push({ question_text: "This role needs your own laptop. Do you have one?", answer_type: "yes_no", is_required: true, kind: "basic" });
  return out;
}

// Anything the basics already cover, so the AI is not allowed to ask it again.
export const COVERED_BY_BASICS = /\b(ctc|salary|package|compensation|notice|join|joining|relocat|location|city|office|working days|currently working|current(ly)? employ|laptop|device|expected pay|expected fixed)\b/i;
