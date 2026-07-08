"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud, FileText, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  cityOptions,
  cityStateMap,
  ctcOptions,
  subDomainsForCategory,
  experienceOptions,
  noticePeriodOptions,
  employmentStatusOptions,
  industryOptions,
  roleTypeOptions,
  teamSizeOptions,
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

  const subDomainOptions = subDomainsForCategory(form.category || null);

  function validate(): string | null {
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.email.trim()) return "Email is required.";
    if (!form.phone.trim()) return "Phone number is required.";
    if (!form.city) return "Location is required.";
    if (form.city === "Other" && !form.city_other.trim()) return "Please enter the city.";
    if (!form.current_fixed_ctc) return "Current fixed CTC is required.";
    if (!form.total_experience_years) return "Total experience is required.";
    if (!form.notice_period) return "When they can join is required.";
    if (!form.category) return "Category is required.";
    if (!form.sub_domain) return "Sub-domain is required.";
    if (form.sub_domain === "Other" && !form.sub_domain_other.trim()) return "Please enter the sub-domain.";
    if (!form.current_job_title.trim()) return "Current job title is required.";
    if (!form.current_employer.trim()) return "Current employer is required.";
    if (!form.current_employment_status) return "Employment status is required.";
    if (!form.current_industry) return "Current industry is required.";
    if (!form.role_type) return "IC / Team Lead is required.";
    if (form.role_type === "Leading a Team" && !form.team_size) return "Team size is required.";
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

    const resolvedSubDomain =
      form.sub_domain === "Other" || form.sub_domain === "" ? form.sub_domain_other || null : form.sub_domain;

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
      <h1 className="text-lg font-semibold text-slate-900 mb-1">Create candidate</h1>
      <p className="text-sm text-slate-500 mb-6">
        The fields below are mandatory for a recruiter-sourced profile. Deeper fields (quota, deal size,
        self-assessment) still come from the candidate once you send a completion invite.
      </p>
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Full name *</label>
          <input
            required
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Email *</label>
          <input
            required
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Phone *</label>
          <input
            required
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Location *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Category *</label>
          <select
            required
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, sub_domain: "" }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          >
            <option value="">Select...</option>
            <option value="b2b_sales">B2B Sales</option>
            <option value="b2c_sales">B2C Sales</option>
            <option value="non_sales">Non-Sales</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sub-domain *</label>
          {subDomainOptions.length > 0 ? (
            <>
              <select
                value={form.sub_domain}
                onChange={(e) => setForm((f) => ({ ...f, sub_domain: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              >
                <option value="">Select...</option>
                {subDomainOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
                <option value="Other">Other</option>
              </select>
              {form.sub_domain === "Other" && (
                <input
                  value={form.sub_domain_other}
                  onChange={(e) => setForm((f) => ({ ...f, sub_domain_other: e.target.value }))}
                  placeholder="e.g. SaaS Sales"
                  className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              )}
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Current fixed CTC *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Total experience *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">When can they join? *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Current job title *</label>
          <input
            required
            value={form.current_job_title}
            onChange={(e) => setForm((f) => ({ ...f, current_job_title: e.target.value }))}
            placeholder="e.g. Senior Account Executive"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Current employer *</label>
          <input
            required
            value={form.current_employer}
            onChange={(e) => setForm((f) => ({ ...f, current_employer: e.target.value }))}
            placeholder="Company name"
            className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Employment status *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Current industry *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">IC or leading a team? *</label>
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
            <label className="block text-xs font-medium text-slate-600 mb-1">Team size *</label>
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Resume</label>
          {resumeFile ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                <span className="text-sm text-slate-700 truncate">{resumeFile.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setResumeFile(null)}
                className="text-slate-400 hover:text-slate-600 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:bg-slate-50 cursor-pointer">
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
          <label className="block text-xs font-medium text-slate-600 mb-1">Note</label>
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
