"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  cityOptions,
  cityStateMap,
  ctcOptions,
  experienceOptions,
  noticePeriodOptions,
  employmentStatusOptions,
  industryOptions,
  roleTypeOptions,
  teamSizeOptions,
  profileTypeOptions,
  level1OptionsForProfileType,
  subDomainsForPractice,
  languageOptions,
  highestQualificationOptions,
  workModeOptions,
  relocationOptions,
} from "@/lib/candidate-options";

export default function NewCandidatePage() {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    category: "",
    sub_domain: "",
    sub_domain_other: "",
    other_b2b_subdomain: "",
    other_b2b_subdomain_custom: "",
    ask_candidate_later_subdomain: false,
    languages_known: [] as string[],
    custom_language: "",
    ask_candidate_later_languages: false,
    city: "",
    city_other: "",
    current_fixed_ctc: "",
    ask_candidate_later_current_fixed_ctc: false,
    expected_fixed_ctc: "",
    ask_candidate_later_expected_fixed_ctc: false,
    total_experience_years: "",
    ask_candidate_later_total_experience_years: false,
    notice_period: "",
    ask_candidate_later_notice_period: false,
    current_job_title: "",
    ask_candidate_later_current_job_title: false,
    current_employer: "",
    ask_candidate_later_current_employer: false,
    current_employment_status: "",
    ask_candidate_later_current_employment_status: false,
    current_industry: "",
    ask_candidate_later_current_industry: false,
    highest_qualification: "",
    highest_qualification_other: "",
    ask_candidate_later_highest_qualification: false,
    work_mode: "",
    ask_candidate_later_work_mode: false,
    open_to_relocation: "",
    ask_candidate_later_open_to_relocation: false,
    role_type: "",
    ask_candidate_later_role_type: false,
    team_size: "",
    recruiter_seed_note: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [askCandidateLaterResume, setAskCandidateLaterResume] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Level 1 options under whichever Profile Type is picked -- Practice under
  // B2B, Vertical under B2C, Function under Non-Sales. Matches the unified
  // taxonomy now live on jobs.staffanchor.com's ApplyForm; `sub_domain`
  // stores this Level 1 value directly, same DB column as before.
  const subDomainOptions = level1OptionsForProfileType(form.category || null);

  function validate(): string | null {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!form.city) return "Location is required.";
    if (form.city === "Other" && !form.city_other.trim()) return "Please enter the city.";
    if (!form.category) return "Profile Type is required.";
    if (!form.ask_candidate_later_subdomain) {
      if (!form.sub_domain) return "Practice / Vertical / Function is required (or check 'Ask candidate later').";
      if (form.sub_domain === "Other" && !form.sub_domain_other.trim()) return "Please enter the value, or check 'Ask candidate later'.";
    }
    if (!form.ask_candidate_later_current_fixed_ctc && !form.current_fixed_ctc) {
      return "Current fixed CTC is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_expected_fixed_ctc && !form.expected_fixed_ctc) {
      return "Expected fixed CTC is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_total_experience_years && !form.total_experience_years) {
      return "Total experience is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_notice_period && !form.notice_period) {
      return "Days to join is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_current_job_title && !form.current_job_title.trim()) {
      return "Current job title is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_current_employer && !form.current_employer.trim()) {
      return "Current employer is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_current_employment_status && !form.current_employment_status) {
      return "Employment status is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_current_industry && !form.current_industry) {
      return "Current industry is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_highest_qualification) {
      if (!form.highest_qualification) return "Highest qualification is required (or check 'Ask candidate later').";
      if (form.highest_qualification === "Other" && !form.highest_qualification_other.trim()) {
        return "Please enter the qualification, or check 'Ask candidate later'.";
      }
    }
    if (!form.ask_candidate_later_work_mode && !form.work_mode) {
      return "Work mode is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_open_to_relocation && !form.open_to_relocation) {
      return "Open to relocation is required (or check 'Ask candidate later').";
    }
    if (!form.ask_candidate_later_role_type) {
      if (!form.role_type) return "IC / Team Lead is required (or check 'Ask candidate later').";
      if (form.role_type === "Leading a Team" && !form.team_size) return "Team size is required.";
    }
    if (!askCandidateLaterResume && !resumeFile) return "Resume is required (or check 'Ask candidate later').";
    if (!form.ask_candidate_later_languages && !form.languages_known.length) {
      return "Languages known is required (or check 'Ask candidate later').";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);

    let resumeFileUrl: string | null = null;
    if (resumeFile) {
      // Sanitize -- Supabase Storage object keys reject characters real resume
      // filenames commonly contain (e.g. square brackets in "Naukri_Name[3y_6m].pdf").
      const safeName = resumeFile.name
        .normalize("NFKD")
        .replace(/[^\w.\-]+/g, "_")
        .replace(/_+/g, "_");
      const path = `${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, resumeFile, {
        contentType: resumeFile.type || undefined,
      });
      if (uploadError) {
        setSaving(false);
        setError(`Resume upload failed: ${uploadError.message}`);
        return;
      }
      resumeFileUrl = path;
    }

    const resolvedSubDomain = form.ask_candidate_later_subdomain
      ? null
      : form.sub_domain === "Other" || form.sub_domain === ""
        ? form.sub_domain_other || null
        : form.sub_domain;

    const resolvedLocation =
      form.city === "Other"
        ? form.city_other || null
        : form.city
          ? `${form.city}, ${cityStateMap[form.city]}`
          : null;

    const resolvedHighestQualification = form.ask_candidate_later_highest_qualification
      ? null
      : form.highest_qualification === "Other"
        ? form.highest_qualification_other || null
        : form.highest_qualification || null;

    // Everything the recruiter checked "ask candidate later" on -- stored as
    // a flat string array so the inbox-sweep cron can detect these
    // explicitly-flagged candidates and so the profile-completion invite
    // email (send-invite route) can reference exactly what's outstanding.
    const missingFields: string[] = [];
    if (form.ask_candidate_later_subdomain) missingFields.push("sub_domain");
    if (form.ask_candidate_later_current_employer) missingFields.push("current_employer");
    if (form.ask_candidate_later_current_job_title) missingFields.push("current_job_title");
    if (form.ask_candidate_later_current_employment_status) missingFields.push("current_employment_status");
    if (form.ask_candidate_later_current_industry) missingFields.push("current_industry");
    if (form.ask_candidate_later_total_experience_years) missingFields.push("total_experience_years");
    if (form.ask_candidate_later_current_fixed_ctc) missingFields.push("current_fixed_ctc");
    if (form.ask_candidate_later_expected_fixed_ctc) missingFields.push("expected_fixed_ctc");
    if (form.ask_candidate_later_notice_period) missingFields.push("notice_period");
    if (form.ask_candidate_later_role_type) missingFields.push("role_type");
    if (form.ask_candidate_later_highest_qualification) missingFields.push("highest_qualification");
    if (form.ask_candidate_later_work_mode) missingFields.push("work_mode");
    if (form.ask_candidate_later_open_to_relocation) missingFields.push("open_to_relocation");
    if (form.ask_candidate_later_languages) missingFields.push("languages_known");
    if (askCandidateLaterResume) missingFields.push("resume");

    const segmentData: Record<string, unknown> = {
      role_type: form.ask_candidate_later_role_type ? null : form.role_type === "Leading a Team" ? "Team Lead" : "IC",
    };
    if (!form.ask_candidate_later_role_type && form.role_type === "Leading a Team" && form.team_size) {
      segmentData.team_size = form.team_size;
    }
    if (!form.ask_candidate_later_languages && form.languages_known.length) {
      segmentData.languages_known = Array.from(
        new Set(
          form.languages_known
            .filter((l) => l !== "Other")
            .concat(form.languages_known.includes("Other") ? [form.custom_language.trim()] : [])
            .filter(Boolean)
        )
      );
    }
    if (!form.ask_candidate_later_subdomain && form.sub_domain === "Other B2B" && form.other_b2b_subdomain) {
      segmentData.other_b2b_subdomain =
        form.other_b2b_subdomain === "Other" ? form.other_b2b_subdomain_custom.trim() : form.other_b2b_subdomain;
    }
    if (missingFields.length > 0) {
      segmentData.missing_fields = missingFields;
    }

    // Server-side create route: creates/links a real auth.users account for
    // this candidate's email (service-role only, never exposed to the
    // browser), inserts the candidates row, stamps user_id, and -- since
    // this is Recruiter Created (no candidate consent needed) -- always
    // sends a branded welcome + magic-link login email. See
    // src/app/api/candidate-create for the full flow. Transport-only change
    // from the old direct supabase.from("candidates").insert(...) call --
    // every field collected above is unchanged.
    const res = await fetch("/api/candidate-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate: {
          full_name: form.full_name,
          email: form.email,
          phone: form.phone || null,
          category: form.category || null,
          sub_domain: resolvedSubDomain,
          current_location: resolvedLocation,
          current_fixed_ctc:
            !form.ask_candidate_later_current_fixed_ctc && form.current_fixed_ctc ? Number(form.current_fixed_ctc) : null,
          expected_fixed_ctc:
            !form.ask_candidate_later_expected_fixed_ctc && form.expected_fixed_ctc ? Number(form.expected_fixed_ctc) : null,
          total_experience_years:
            !form.ask_candidate_later_total_experience_years && form.total_experience_years
              ? Number(form.total_experience_years)
              : null,
          notice_period: !form.ask_candidate_later_notice_period ? form.notice_period || null : null,
          current_job_title: !form.ask_candidate_later_current_job_title ? form.current_job_title || null : null,
          current_employer: !form.ask_candidate_later_current_employer ? form.current_employer || null : null,
          current_employment_status: !form.ask_candidate_later_current_employment_status
            ? form.current_employment_status || null
            : null,
          current_industry: !form.ask_candidate_later_current_industry ? form.current_industry || null : null,
          industries: !form.ask_candidate_later_current_industry && form.current_industry ? [form.current_industry] : [],
          highest_qualification: resolvedHighestQualification,
          work_mode: !form.ask_candidate_later_work_mode ? form.work_mode || null : null,
          open_to_relocation: !form.ask_candidate_later_open_to_relocation ? form.open_to_relocation || null : null,
          segment_data: segmentData,
          resume_file_url: resumeFileUrl,
          recruiter_seed_note: form.recruiter_seed_note || null,
          status: "awaiting_input",
          created_by: "recruiter_created",
          source: "referral",
        },
      }),
    });
    const data = await res.json().catch(() => ({}));

    setSaving(false);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      return;
    }

    // Fire-and-forget: if a resume was attached there's enough to work with
    // for an AI summary right away, so generate it now instead of waiting
    // for a recruiter to remember to click "Generate" later. Doesn't block
    // navigation -- the candidate page will just show it once ready.
    if (resumeFileUrl) {
      fetch("/api/ai-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId: data.candidateId }),
      }).catch(() => {
        // Best-effort; the recruiter can still click Generate manually on
        // the candidate page if this silently fails.
      });
    }

    router.push(`/candidates/${data.candidateId}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Create candidate</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Full name, email, phone, and location are always required -- that's how we'd ever reach this candidate again.
        Everything else can be checked &quot;ask candidate later&quot; if you don&apos;t have it on hand; it'll show up
        as an open item in the Priority Actions inbox and get asked for again via their profile-completion invite.
      </p>
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Full name *</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Phone *</label>
          <input
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Location *</label>
          <select
            required
            value={form.city}
            onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {form.city === "Other" && (
            <input
              value={form.city_other}
              onChange={(e) => setForm((f) => ({ ...f, city_other: e.target.value }))}
              placeholder="City, State"
              className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Profile Type *</label>
          <select
            required
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, sub_domain: "" }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {profileTypeOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {form.category === "b2b_sales" ? "Practice" : form.category === "b2c_sales" ? "Vertical" : "Function"}
            {!form.ask_candidate_later_subdomain && " *"}
          </label>
          {subDomainOptions.length > 0 ? (
            <>
              <select
                disabled={form.ask_candidate_later_subdomain}
                value={form.sub_domain}
                onChange={(e) => setForm((f) => ({ ...f, sub_domain: e.target.value, sub_domain_other: "" }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Select...</option>
                {/* subDomainOptions already ends in its own "Other" for B2C
                    Verticals / Non-Sales Functions -- no extra hardcoded option
                    appended here (that used to render two "Other" entries). */}
                {subDomainOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              {form.sub_domain === "Other" && !form.ask_candidate_later_subdomain && (
                <input
                  value={form.sub_domain_other}
                  onChange={(e) => setForm((f) => ({ ...f, sub_domain_other: e.target.value }))}
                  placeholder="e.g. SaaS Sales"
                  className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
              {form.sub_domain === "Other B2B" && !form.ask_candidate_later_subdomain && (
                <div className="mt-2 space-y-2">
                  <select
                    value={form.other_b2b_subdomain || ""}
                    onChange={(e) => setForm((f) => ({ ...f, other_b2b_subdomain: e.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    <option value="">Select...</option>
                    {subDomainsForPractice("Other B2B").map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                  {form.other_b2b_subdomain === "Other" && (
                    <input
                      value={form.other_b2b_subdomain_custom || ""}
                      onChange={(e) => setForm((f) => ({ ...f, other_b2b_subdomain_custom: e.target.value }))}
                      placeholder="Please specify"
                      className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    />
                  )}
                </div>
              )}
              <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <input
                  type="checkbox"
                  checked={form.ask_candidate_later_subdomain}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      ask_candidate_later_subdomain: e.target.checked,
                      sub_domain: e.target.checked ? "" : f.sub_domain,
                      sub_domain_other: e.target.checked ? "" : f.sub_domain_other,
                    }))
                  }
                />
                Not sure — ask candidate later
              </label>
            </>
          ) : (
            <input
              value={form.sub_domain_other}
              onChange={(e) => setForm((f) => ({ ...f, sub_domain_other: e.target.value }))}
              placeholder="Pick a category above to choose from the known list, or type here"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Current fixed CTC{!form.ask_candidate_later_current_fixed_ctc && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_current_fixed_ctc}
            value={form.current_fixed_ctc}
            onChange={(e) => setForm((f) => ({ ...f, current_fixed_ctc: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {ctcOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_current_fixed_ctc}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_current_fixed_ctc: e.target.checked,
                  current_fixed_ctc: e.target.checked ? "" : f.current_fixed_ctc,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Expected fixed CTC{!form.ask_candidate_later_expected_fixed_ctc && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_expected_fixed_ctc}
            value={form.expected_fixed_ctc}
            onChange={(e) => setForm((f) => ({ ...f, expected_fixed_ctc: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {ctcOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_expected_fixed_ctc}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_expected_fixed_ctc: e.target.checked,
                  expected_fixed_ctc: e.target.checked ? "" : f.expected_fixed_ctc,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Total experience{!form.ask_candidate_later_total_experience_years && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_total_experience_years}
            value={form.total_experience_years}
            onChange={(e) => setForm((f) => ({ ...f, total_experience_years: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {experienceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_total_experience_years}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_total_experience_years: e.target.checked,
                  total_experience_years: e.target.checked ? "" : f.total_experience_years,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Days to join{!form.ask_candidate_later_notice_period && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_notice_period}
            value={form.notice_period}
            onChange={(e) => setForm((f) => ({ ...f, notice_period: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {noticePeriodOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_notice_period}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_notice_period: e.target.checked,
                  notice_period: e.target.checked ? "" : f.notice_period,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Current job title{!form.ask_candidate_later_current_job_title && " *"}
          </label>
          <input
            disabled={form.ask_candidate_later_current_job_title}
            value={form.current_job_title}
            onChange={(e) => setForm((f) => ({ ...f, current_job_title: e.target.value }))}
            placeholder="e.g. Senior Account Executive"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_current_job_title}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_current_job_title: e.target.checked,
                  current_job_title: e.target.checked ? "" : f.current_job_title,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Current employer{!form.ask_candidate_later_current_employer && " *"}
          </label>
          <input
            disabled={form.ask_candidate_later_current_employer}
            value={form.current_employer}
            onChange={(e) => setForm((f) => ({ ...f, current_employer: e.target.value }))}
            placeholder="Company name"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          />
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_current_employer}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_current_employer: e.target.checked,
                  current_employer: e.target.checked ? "" : f.current_employer,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Employment status{!form.ask_candidate_later_current_employment_status && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_current_employment_status}
            value={form.current_employment_status}
            onChange={(e) => setForm((f) => ({ ...f, current_employment_status: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {employmentStatusOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_current_employment_status}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_current_employment_status: e.target.checked,
                  current_employment_status: e.target.checked ? "" : f.current_employment_status,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Current industry{!form.ask_candidate_later_current_industry && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_current_industry}
            value={form.current_industry}
            onChange={(e) => setForm((f) => ({ ...f, current_industry: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {industryOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_current_industry}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_current_industry: e.target.checked,
                  current_industry: e.target.checked ? "" : f.current_industry,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Highest qualification{!form.ask_candidate_later_highest_qualification && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_highest_qualification}
            value={form.highest_qualification}
            onChange={(e) => setForm((f) => ({ ...f, highest_qualification: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {highestQualificationOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {form.highest_qualification === "Other" && !form.ask_candidate_later_highest_qualification && (
            <input
              value={form.highest_qualification_other}
              onChange={(e) => setForm((f) => ({ ...f, highest_qualification_other: e.target.value }))}
              placeholder="Please specify"
              className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_highest_qualification}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_highest_qualification: e.target.checked,
                  highest_qualification: e.target.checked ? "" : f.highest_qualification,
                  highest_qualification_other: e.target.checked ? "" : f.highest_qualification_other,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Work mode{!form.ask_candidate_later_work_mode && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_work_mode}
            value={form.work_mode}
            onChange={(e) => setForm((f) => ({ ...f, work_mode: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {workModeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_work_mode}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_work_mode: e.target.checked,
                  work_mode: e.target.checked ? "" : f.work_mode,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Languages Known{!form.ask_candidate_later_languages && " *"}
          </label>
          {!form.ask_candidate_later_languages && (
            <>
              <div className="flex flex-wrap gap-2">
                {languageOptions.map((lang) => {
                  const active = form.languages_known.includes(lang);
                  return (
                    <button
                      type="button"
                      key={lang}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          languages_known: active
                            ? f.languages_known.filter((l) => l !== lang)
                            : [...f.languages_known, lang],
                        }))
                      }
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                        active
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      {active ? "✓ " : "+ "}
                      {lang}
                    </button>
                  );
                })}
              </div>
              {form.languages_known.includes("Other") && (
                <input
                  value={form.custom_language}
                  onChange={(e) => setForm((f) => ({ ...f, custom_language: e.target.value }))}
                  placeholder="Please specify other language(s)"
                  className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
            </>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_languages}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_languages: e.target.checked,
                  languages_known: e.target.checked ? [] : f.languages_known,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Open to relocation{!form.ask_candidate_later_open_to_relocation && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_open_to_relocation}
            value={form.open_to_relocation}
            onChange={(e) => setForm((f) => ({ ...f, open_to_relocation: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {relocationOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_open_to_relocation}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_open_to_relocation: e.target.checked,
                  open_to_relocation: e.target.checked ? "" : f.open_to_relocation,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            IC or leading a team?{!form.ask_candidate_later_role_type && " *"}
          </label>
          <select
            disabled={form.ask_candidate_later_role_type}
            value={form.role_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, role_type: e.target.value, team_size: e.target.value === "Leading a Team" ? f.team_size : "" }))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">Select...</option>
            {roleTypeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          {form.role_type === "Leading a Team" && !form.ask_candidate_later_role_type && (
            <select
              required
              value={form.team_size}
              onChange={(e) => setForm((f) => ({ ...f, team_size: e.target.value }))}
              className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Select team size...</option>
              {teamSizeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={form.ask_candidate_later_role_type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  ask_candidate_later_role_type: e.target.checked,
                  role_type: e.target.checked ? "" : f.role_type,
                  team_size: e.target.checked ? "" : f.team_size,
                }))
              }
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Resume{!askCandidateLaterResume && " *"}
          </label>
          {askCandidateLaterResume ? (
            <p className="text-xs text-slate-400 italic px-1 py-1">Will collect this from the candidate later.</p>
          ) : resumeFile ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{resumeFile.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setResumeFile(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <UploadCloud className="w-4 h-4 shrink-0" />
              <span>Click to upload their CV (PDF, DOC, DOCX) — often the recruiter already has it on hand</span>
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              />
            </label>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={askCandidateLaterResume}
              onChange={(e) => {
                setAskCandidateLaterResume(e.target.checked);
                if (e.target.checked) setResumeFile(null);
              }}
            />
            Not sure — ask candidate later
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Note</label>
          <textarea
            value={form.recruiter_seed_note}
            onChange={(e) => setForm((f) => ({ ...f, recruiter_seed_note: e.target.value }))}
            placeholder="e.g. Met at SaaS founders event, ex-Freshworks AE, strong"
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 disabled:opacity-60"
        >
          {saving ? "Creating..." : "Create candidate"}
        </button>
      </form>
    </div>
  );
}
