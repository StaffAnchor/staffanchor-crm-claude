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
    ask_candidate_later_subdomain: false,
    city: "",
    city_other: "",
    current_fixed_ctc: "",
    total_experience_years: "",
    notice_period: "",
    current_job_title: "",
    current_employer: "",
    current_employment_status: "",
    current_industry: "",
    role_type: "",
    team_size: "",
    recruiter_seed_note: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
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
    if (!form.current_fixed_ctc) return "Current fixed CTC is required.";
    if (!form.total_experience_years) return "Total experience is required.";
    if (!form.notice_period) return "When they can join is required.";
    if (!form.category) return "Profile Type is required.";
    if (!form.ask_candidate_later_subdomain) {
      if (!form.sub_domain) return "Practice / Vertical / Function is required (or check 'Ask candidate later').";
      if (form.sub_domain === "Other" && !form.sub_domain_other.trim()) return "Please enter the value, or check 'Ask candidate later'.";
    }
    if (!form.current_job_title.trim()) return "Current job title is required.";
    if (!form.current_employer.trim()) return "Current employer is required.";
    if (!form.current_employment_status) return "Employment status is required.";
    if (!form.current_industry) return "Current industry is required.";
    if (!form.role_type) return "IC / Team Lead is required.";
    if (form.role_type === "Leading a Team" && !form.team_size) return "Team size is required.";
    if (!resumeFile) return "Resume is required.";
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let resumeFileUrl: string | null = null;
    if (resumeFile) {
      const path = `${crypto.randomUUID()}-${resumeFile.name}`;
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

    const segmentData: Record<string, unknown> = {
      role_type: form.role_type === "Leading a Team" ? "Team Lead" : "IC",
    };
    if (form.role_type === "Leading a Team" && form.team_size) {
      segmentData.team_size = form.team_size;
    }

    const { data, error } = await supabase
      .from("candidates")
      .insert({
        full_name: form.full_name,
        email: form.email,
        phone: form.phone || null,
        category: form.category || null,
        sub_domain: resolvedSubDomain,
        current_location: resolvedLocation,
        current_fixed_ctc: form.current_fixed_ctc ? Number(form.current_fixed_ctc) : null,
        total_experience_years: form.total_experience_years ? Number(form.total_experience_years) : null,
        notice_period: form.notice_period || null,
        current_job_title: form.current_job_title || null,
        current_employer: form.current_employer || null,
        current_employment_status: form.current_employment_status || null,
        current_industry: form.current_industry || null,
        industries: form.current_industry ? [form.current_industry] : [],
        segment_data: segmentData,
        resume_file_url: resumeFileUrl,
        recruiter_seed_note: form.recruiter_seed_note || null,
        status: "awaiting_input",
        created_by: "recruiter_created",
        created_by_user: user?.id,
        source: "referral",
      })
      .select("id")
      .single();

    setSaving(false);
    if (error) {
      setError(error.message);
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
        body: JSON.stringify({ candidateId: data.id }),
      }).catch(() => {
        // Best-effort; the recruiter can still click Generate manually on
        // the candidate page if this silently fails.
      });
    }

    router.push(`/candidates/${data.id}`);
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">Create candidate</h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        The fields below are mandatory for a recruiter-sourced profile. Deeper fields (quota, deal size,
        self-assessment) still come from the candidate once you send a completion invite.
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
                onChange={(e) => setForm((f) => ({ ...f, sub_domain: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm disabled:bg-slate-100 disabled:text-slate-400"
              >
                <option value="">Select...</option>
                {subDomainOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
              {form.sub_domain === "Other" && !form.ask_candidate_later_subdomain && (
                <input
                  value={form.sub_domain_other}
                  onChange={(e) => setForm((f) => ({ ...f, sub_domain_other: e.target.value }))}
                  placeholder="e.g. SaaS Sales"
                  className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
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
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current fixed CTC *</label>
          <select
            required
            value={form.current_fixed_ctc}
            onChange={(e) => setForm((f) => ({ ...f, current_fixed_ctc: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {ctcOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Total experience *</label>
          <select
            required
            value={form.total_experience_years}
            onChange={(e) => setForm((f) => ({ ...f, total_experience_years: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {experienceOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Days to join *</label>
          <select
            required
            value={form.notice_period}
            onChange={(e) => setForm((f) => ({ ...f, notice_period: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {noticePeriodOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current job title *</label>
          <input
            required
            value={form.current_job_title}
            onChange={(e) => setForm((f) => ({ ...f, current_job_title: e.target.value }))}
            placeholder="e.g. Senior Account Executive"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current employer *</label>
          <input
            required
            value={form.current_employer}
            onChange={(e) => setForm((f) => ({ ...f, current_employer: e.target.value }))}
            placeholder="Company name"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Employment status *</label>
          <select
            required
            value={form.current_employment_status}
            onChange={(e) => setForm((f) => ({ ...f, current_employment_status: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {employmentStatusOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Current industry *</label>
          <select
            required
            value={form.current_industry}
            onChange={(e) => setForm((f) => ({ ...f, current_industry: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {industryOptions.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">IC or leading a team? *</label>
          <select
            required
            value={form.role_type}
            onChange={(e) =>
              setForm((f) => ({ ...f, role_type: e.target.value, team_size: e.target.value === "Leading a Team" ? f.team_size : "" }))
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            {roleTypeOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        {form.role_type === "Leading a Team" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Team size *</label>
            <select
              required
              value={form.team_size}
              onChange={(e) => setForm((f) => ({ ...f, team_size: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            >
              <option value="">Select...</option>
              {teamSizeOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Resume *</label>
          {resumeFile ? (
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
