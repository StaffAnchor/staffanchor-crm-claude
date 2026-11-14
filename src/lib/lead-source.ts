// Where a candidate came from, in words a recruiter reads at a glance: "Uploaded by recruiter · Naukri", "Applied on our site · from LinkedIn".
// It reads how the profile was created and which channel it was downloaded from, and falls back to how they got into this role.

type Cand = { created_by?: string | null; source?: string | null; source_channel?: string | null; acquisition_source?: string | null };

const ACQ: Record<string, string> = {
  google_jobs_apply: "Google Jobs", google: "Google", linkedin: "LinkedIn", "com.linkedin.android": "LinkedIn", direct: "direct visit", iimjobs: "IIMJobs", naukri: "Naukri", whatsapp: "WhatsApp", instagram: "Instagram",
};

export type LeadSource = { label: string; detail: string | null };

export function leadSourceOf(c: Cand, origin?: string | null, originLabel?: string | null): LeadSource {
  const channel = c.source_channel && c.source_channel !== "Other" ? c.source_channel : null;
  const acq = c.acquisition_source ? ACQ[c.acquisition_source.toLowerCase()] ?? c.acquisition_source : null;
  const by = (c.created_by ?? "").toLowerCase();
  const src = (c.source ?? "").toLowerCase();

  if (by === "bulk_resume_upload") return { label: "Uploaded by recruiter", detail: channel };
  if (by === "naukri_export" || src === "naukri_resdex_export") return { label: "Naukri export", detail: null };
  if (by === "zoho_recruit_import" || src === "zoho_recruit_import") return { label: "Imported from Zoho", detail: null };
  if (by === "extension" || by === "linkedin_extension") return { label: "Saved from LinkedIn", detail: null };
  if (src === "job_listing_quick_apply" || origin === "applied") return { label: "Applied on our job page", detail: acq ?? channel };
  if (by === "self_registration" || src === "generic_registration") return { label: "Registered on our site", detail: acq ?? channel };
  if (src === "onboarding_progressive_save") return { label: "Started a profile on our site", detail: acq ?? channel };
  if (origin === "vendor") return { label: originLabel ?? "Vendor submission", detail: channel };
  if (origin === "ai") return { label: "Suggested by the system", detail: channel };
  if (channel) return { label: `From ${channel}`, detail: originLabel && origin === "team" ? originLabel : null };
  if (originLabel && origin !== "earlier") return { label: originLabel, detail: null };
  return { label: "Source not recorded", detail: null };
}
