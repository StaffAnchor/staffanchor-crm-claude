// The details a recruiter needs on every profile before it can be matched well. Used to show what
// is missing and to ask the candidate for just those things.
export type KeyDetailCandidate = {
  email?: string | null;
  current_job_title?: string | null;
  current_employer?: string | null;
  total_experience_years?: number | string | null;
  current_fixed_ctc?: number | string | null;
  expected_fixed_ctc?: number | string | null;
  notice_period?: string | null;
  current_location?: string | null;
  resume_file_url?: string | null;
};

const KEY_DETAILS: { key: keyof KeyDetailCandidate; label: string; ask: string }[] = [
  { key: "current_job_title", label: "Current role", ask: "your current role" },
  { key: "current_employer", label: "Current company", ask: "your current company" },
  { key: "total_experience_years", label: "Experience", ask: "your total experience" },
  { key: "current_fixed_ctc", label: "Current CTC", ask: "your current fixed CTC" },
  { key: "expected_fixed_ctc", label: "Expected CTC", ask: "your expected fixed CTC" },
  { key: "notice_period", label: "Notice period", ask: "your notice period" },
  { key: "current_location", label: "City", ask: "the city you are based in" },
  { key: "resume_file_url", label: "CV", ask: "your latest CV" },
];

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** What is missing from a profile: labels for the recruiter, and a phrase for each to ask the candidate. */
export function missingKeyDetails(c: KeyDetailCandidate): { key: string; label: string; ask: string }[] {
  // 0 is a real answer for experience and current CTC (a fresher, or not working).
  return KEY_DETAILS.filter((d) => blank(c[d.key])).map(({ key, label, ask }) => ({ key, label, ask }));
}
