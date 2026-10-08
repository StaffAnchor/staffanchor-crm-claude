import { missingKeyDetails, type KeyDetailCandidate } from "@/lib/key-details";

// A draft a recruiter can read, edit and send: what the profile is missing, as one friendly message.
const EXAMPLE: Record<string, string> = {
  current_fixed_ctc: "12 LPA",
  expected_fixed_ctc: "16 LPA",
  notice_period: "30 days",
  total_experience_years: "6 years",
  current_location: "Gurgaon",
  current_employer: "Acme Ltd",
  current_job_title: "Sales Manager",
};

export function draftMissingMessage(fullName: string | null | undefined, c: KeyDetailCandidate, hasResumeAlready: boolean): string | null {
  const missing = missingKeyDetails(c);
  if (missing.length === 0) return null;
  const first = (fullName ?? "").trim().split(/\s+/)[0] || "there";
  const lines = missing.map((m, i) => `${i + 1}. ${m.ask.charAt(0).toUpperCase()}${m.ask.slice(1)}`);
  const typed = missing.filter((m) => EXAMPLE[m.key]);
  const example = typed.length >= 2 ? `\n\nA one-line reply is fine, for example: "${typed.map((m) => EXAMPLE[m.key]).join(", ")}".` : "";
  const intro = hasResumeAlready ? "thanks for sharing your profile" : "thanks for getting in touch";
  return `Hi ${first}, ${intro}. To match you with the right roles, could you share ${missing.length === 1 ? "one quick detail" : `${missing.length} quick details`}?\n${lines.join("\n")}${example}`;
}
