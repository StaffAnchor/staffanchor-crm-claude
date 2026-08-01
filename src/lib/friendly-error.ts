// Gap identified in the July 2026 audit: several vendor-facing pages
// rendered a raw Postgres/PostgREST error string directly to external
// freelancers -- e.g. `permission denied for table candidate_mandate_links`
// or `invalid input syntax for type uuid` -- which is meaningless (and looks
// broken/unprofessional) to someone outside the company with no visibility
// into the schema. This maps the handful of error shapes we actually see
// from Supabase/PostgREST to a plain-language message, and falls back to a
// generic "try again or contact your recruiter" message for anything else,
// while still logging the raw message to the console for our own debugging.
export function friendlyVendorError(raw: string | null | undefined, context?: string): string {
  if (raw) {
    // eslint-disable-next-line no-console
    console.error(context ? `[vendor:${context}]` : "[vendor]", raw);
  }
  if (!raw) return "Something went wrong. Please try again, or reach out to your StaffAnchor recruiter.";

  const lower = raw.toLowerCase();
  if (lower.includes("permission denied") || lower.includes("rls") || lower.includes("row-level security")) {
    return "You don't have access to this. If that seems wrong, reach out to your StaffAnchor recruiter.";
  }
  if (lower.includes("jwt") || lower.includes("token") || lower.includes("session")) {
    return "Your session has expired. Please refresh the page and try again.";
  }
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("timeout")) {
    return "Couldn't connect. Please check your internet connection and try again.";
  }
  if (lower.includes("duplicate key") || lower.includes("already exists")) {
    return "This candidate has already been submitted for this mandate.";
  }
  return "Something went wrong loading this. Please try again, or reach out to your StaffAnchor recruiter.";
}
