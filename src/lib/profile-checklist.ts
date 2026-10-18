// What a profile has and what it is missing, in the order that matters for matching and for asking. This is the one list
// used on the profile, in the pipeline and for the WhatsApp ask.

export type ChecklistInput = {
  current_job_title?: string | null;
  current_employer?: string | null;
  total_experience_years?: number | string | null;
  current_fixed_ctc?: number | string | null;
  expected_fixed_ctc?: number | string | null;
  notice_period?: string | null;
  current_location?: string | null;
  city_canonical?: string | null;
  open_to_relocation?: string | null;
  resume_file_url?: string | null;
};

export type ChecklistItem = { key: string; label: string; have: boolean; why: string };

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** `roleLevelKnown`: someone (the candidate, the CV or a recruiter) has made their level clear. */
export function profileChecklist(c: ChecklistInput, roleLevelKnown: boolean): ChecklistItem[] {
  return [
    { key: "current_fixed_ctc", label: "Current pay", have: !blank(c.current_fixed_ctc), why: "Clients screen on pay first" },
    { key: "role_level", label: "Role level", have: roleLevelKnown, why: "Individual seller or team lead decides who fits" },
    { key: "notice_period", label: "Notice period", have: !blank(c.notice_period), why: "How soon they can join" },
    { key: "city", label: "Current city", have: !blank(c.current_location) || !blank(c.city_canonical), why: "Matches roles by location" },
    { key: "open_to_relocation", label: "Open to relocate", have: !blank(c.open_to_relocation), why: "Widens the roles they can fit" },
    { key: "current_employer", label: "Current company", have: !blank(c.current_employer), why: "What and to whom they sell" },
    { key: "expected_fixed_ctc", label: "Expected pay", have: !blank(c.expected_fixed_ctc), why: "Avoids pay mismatch later" },
    { key: "total_experience_years", label: "Experience", have: !blank(c.total_experience_years), why: "Fits the experience range" },
    { key: "resume_file_url", label: "CV", have: !blank(c.resume_file_url), why: "Lets us read what they actually do" },
  ];
}
