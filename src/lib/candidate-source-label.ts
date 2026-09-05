// Human-readable labels for how a candidate entered the system, derived from
// candidates.created_by (set once at insert time, never touched again -- see
// admin_reassign_candidate_owner, which only updates owner_id) and the legacy
// candidates.source column written by the public jobs.staffanchor.com /
// Zoho-import side of the system.
//
// created_by values written by THIS repo (all recruiter/staff-driven):
//   recruiter_created  -- manual "Add Candidate" form (candidates/new)
//   bulk_resume_upload -- recruiter CSV/resume bulk upload
//   browser_extension  -- LinkedIn Chrome extension "Save to StaffAnchor"
//   linkedin_sourced   -- promoted from the mandate page's LinkedIn Sourced tool
//
// source values written elsewhere (self-service, not recruiter-driven):
//   zoho_recruit_import, onboarding_progressive_save, generic_registration,
//   job_listing_quick_apply, candidate_portal

const RECRUITER_DRIVEN_CREATED_BY = new Set([
  "recruiter_created",
  "bulk_resume_upload",
  "browser_extension",
  "linkedin_sourced",
]);

const CREATED_BY_LABELS: Record<string, string> = {
  recruiter_created: "Recruiter Added",
  bulk_resume_upload: "Bulk Upload",
  browser_extension: "LinkedIn Extension",
  linkedin_sourced: "LinkedIn Sourced",
};

const SELF_SERVICE_SOURCE_LABELS: Record<string, string> = {
  zoho_recruit_import: "Zoho Import",
  onboarding_progressive_save: "Self-Registered",
  generic_registration: "Self-Registered",
  job_listing_quick_apply: "Job Application",
  candidate_portal: "Candidate Portal",
};

export function isRecruiterDrivenSource(createdBy: string | null): boolean {
  return !!createdBy && RECRUITER_DRIVEN_CREATED_BY.has(createdBy);
}

export function sourceChannelLabel(createdBy: string | null, source: string | null): string {
  if (createdBy && CREATED_BY_LABELS[createdBy]) return CREATED_BY_LABELS[createdBy];
  if (source && SELF_SERVICE_SOURCE_LABELS[source]) return SELF_SERVICE_SOURCE_LABELS[source];
  return createdBy || source || "Unknown";
}
