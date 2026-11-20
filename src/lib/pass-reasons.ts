// Plain module (no "use client") so server pages and routes can read the labels too.
export const PASS_REASONS: { value: string; label: string }[] = [
  { value: "client_skills_gap", label: "Not enough relevant experience" },
  { value: "client_too_junior", label: "Too junior for this role" },
  { value: "client_too_senior", label: "Too senior for this role" },
  { value: "client_salary", label: "Expected pay is too high" },
  { value: "client_industry", label: "Not the right industry or domain" },
  { value: "client_location", label: "Location or work mode doesn't fit" },
  { value: "client_notice_period", label: "Notice period is too long" },
  { value: "client_culture_fit", label: "Concerns on communication or culture fit" },
  { value: "lost_to_other_candidate", label: "We chose another candidate" },
  { value: "role_paused_or_closed", label: "The role is on hold or has changed" },
  { value: "already_interviewed", label: "Already interviewed or in our process" },
  { value: "other_client", label: "Other" },
];

export const passReasonLabel = (value: string | null | undefined) => PASS_REASONS.find((r) => r.value === value)?.label ?? null;
