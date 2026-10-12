// Why a recruiter turned down an AI suggestion. Codes are stable (stored in
// mandate_ai_matches.dismissed_reason_codes) so reports can group on them even
// if a label is reworded. Choosing any is optional.
export const DISMISS_REASON_CHIPS: { code: string; label: string }[] = [
  { code: "skills", label: "Skills don't match" },
  { code: "domain", label: "Wrong domain or industry" },
  { code: "too_junior", label: "Too junior" },
  { code: "too_senior", label: "Too senior" },
  { code: "salary", label: "Salary doesn't fit" },
  { code: "notice", label: "Notice period too long" },
  { code: "location", label: "Location doesn't fit" },
  { code: "unstable", label: "Job-hopper" },
  { code: "in_process", label: "Already in process" },
  { code: "not_interested", label: "Not interested" },
];

const BY_CODE = new Map(DISMISS_REASON_CHIPS.map((r) => [r.code, r.label]));

export function dismissReasonLabel(code: string): string {
  return BY_CODE.get(code) ?? code;
}

export function cleanReasonCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.filter((c): c is string => typeof c === "string" && BY_CODE.has(c)))).slice(0, 6);
}
