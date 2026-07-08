"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Loader2, X } from "lucide-react";
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

type Candidate = {
  id: string;
  full_name: string;
  phone: string | null;
  current_location: string | null;
  category: string | null;
  sub_domain: string | null;
  current_fixed_ctc: number | null;
  total_experience_years: number | null;
  notice_period: string | null;
  current_job_title: string | null;
  current_employer: string | null;
  current_employment_status: string | null;
  current_industry: string | null;
  industries: string[] | null;
  status: string;
  segment_data: Record<string, unknown> | null;
};

const MANDATORY_FIELDS_COMPLETE = (f: {
  full_name: string;
  phone: string;
  city: string;
  cityOther: string;
  currentFixedCtc: string;
  totalExperienceYears: string;
  noticePeriod: string;
  category: string;
  subDomain: string;
  subDomainOther: string;
  currentJobTitle: string;
  currentEmployer: string;
  employmentStatus: string;
  currentIndustry: string;
  roleType: string;
  teamSize: string;
}) => {
  if (!f.full_name.trim() || !f.phone.trim()) return false;
  if (!f.city || (f.city === "Other" && !f.cityOther.trim())) return false;
  if (!f.currentFixedCtc || !f.totalExperienceYears || !f.noticePeriod) return false;
  if (!f.category) return false;
  if (!f.subDomain || (f.subDomain === "Other" && !f.subDomainOther.trim())) return false;
  if (!f.currentJobTitle.trim() || !f.currentEmployer.trim()) return false;
  if (!f.employmentStatus || !f.currentIndustry) return false;
  if (!f.roleType) return false;
  if (f.roleType === "Leading a Team" && !f.teamSize) return false;
  return true;
};

export default function EditProfileButton({ candidate }: { candidate: Candidate }) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const knownCity = candidate.current_location
    ? Object.keys(cityStateMap).find((c) => candidate.current_location?.startsWith(c))
    : undefined;

  const [form, setForm] = useState({
    full_name: candidate.full_name ?? "",
    phone: candidate.phone ?? "",
    city: knownCity ?? (candidate.current_location ? "Other" : ""),
    cityOther: knownCity ? "" : candidate.current_location ?? "",
    category: candidate.category ?? "",
    subDomain: candidate.sub_domain ?? "",
    subDomainOther: "",
    currentFixedCtc: candidate.current_fixed_ctc != null ? String(candidate.current_fixed_ctc) : "",
    totalExperienceYears: candidate.total_experience_years != null ? String(candidate.total_experience_years) : "",
    noticePeriod: candidate.notice_period ?? "",
    currentJobTitle: candidate.current_job_title ?? "",
    currentEmployer: candidate.current_employer ?? "",
    employmentStatus: candidate.current_employment_status ?? "",
    currentIndustry: candidate.current_industry ?? "",
    previousIndustries: (candidate.industries ?? []).filter((i) => i !== candidate.current_industry).join(", "),
    roleType:
      (candidate.segment_data?.["role_type"] as string | undefined) === "Team Lead"
        ? "Leading a Team"
        : (candidate.segment_data?.["role_type"] as string | undefined) === "IC"
          ? "Individual Contributor (IC)"
          : "",
    teamSize: (candidate.segment_data?.["team_size"] as string | undefined) ?? "",
  });

  const subDomainOptions = subDomainsForCategory(form.category || null);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setError(null);
    setSaving(true);

    const resolvedCity =
      form.city === "Other" ? form.cityOther.trim() : form.city ? `${form.city}, ${cityStateMap[form.city]}` : "";
    const resolvedSubDomain = form.subDomain === "Other" ? form.subDomainOther.trim() : form.subDomain;

    const previousList = form.previousIndustries
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const industries = Array.from(new Set([form.currentIndustry, ...previousList].filter(Boolean)));

    const segmentData: Record<string, unknown> = { ...(candidate.segment_data ?? {}) };
    if (form.roleType) segmentData.role_type = form.roleType === "Leading a Team" ? "Team Lead" : "IC";
    if (form.roleType === "Leading a Team" && form.teamSize) segmentData.team_size = form.teamSize;
    else delete segmentData.team_size;

    const isComplete = MANDATORY_FIELDS_COMPLETE({
      full_name: form.full_name,
      phone: form.phone,
      city: form.city,
      cityOther: form.cityOther,
      currentFixedCtc: form.currentFixedCtc,
      totalExperienceYears: form.totalExperienceYears,
      noticePeriod: form.noticePeriod,
      category: form.category,
      subDomain: form.subDomain,
      subDomainOther: form.subDomainOther,
      currentJobTitle: form.currentJobTitle,
      currentEmployer: form.currentEmployer,
      employmentStatus: form.employmentStatus,
      currentIndustry: form.currentIndustry,
      roleType: form.roleType,
      teamSize: form.teamSize,
    });

    const update: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      phone: form.phone.trim() || null,
      current_location: resolvedCity || null,
      category: form.category || null,
      sub_domain: resolvedSubDomain || null,
      current_fixed_ctc: form.currentFixedCtc ? Number(form.currentFixedCtc) : null,
      total_experience_years: form.totalExperienceYears ? Number(form.totalExperienceYears) : null,
      notice_period: form.noticePeriod || null,
      current_job_title: form.currentJobTitle.trim() || null,
      current_employer: form.currentEmployer.trim() || null,
      current_employment_status: form.employmentStatus || null,
      current_industry: form.currentIndustry || null,
      industries,
      segment_data: segmentData,
    };

    // Same auto-transition rule used everywhere else in the system: once a
    // profile that was sitting incomplete (awaiting_input / lead) now has
    // everything mandatory filled in, it graduates to "registered" --
    // whether that completion happened through the candidate themselves or,
    // here, a recruiter filling it in from a call.
    if (isComplete && (candidate.status === "awaiting_input" || candidate.status === "lead")) {
      update.status = "registered";
    }

    const { error } = await supabase.from("candidates").update(update).eq("id", candidate.id);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg px-3 py-1.5 transition-colors"
      >
        <Pencil className="w-3 h-3" /> Edit profile
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="text-[14px] font-semibold text-slate-900">Edit profile</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
                <input
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone</label>
                <input
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Location</label>
                <select
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
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
                    value={form.cityOther}
                    onChange={(e) => set("cityOther", e.target.value)}
                    placeholder="City, State"
                    className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Function / Domain</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subDomain: "" }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Select...</option>
                  <option value="b2b_sales">B2B Sales</option>
                  <option value="b2c_sales">B2C Sales</option>
                  <option value="non_sales">Non-Sales</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Sub-domain</label>
                {subDomainOptions.length > 0 ? (
                  <>
                    <select
                      value={form.subDomain}
                      onChange={(e) => set("subDomain", e.target.value)}
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
                    {form.subDomain === "Other" && (
                      <input
                        value={form.subDomainOther}
                        onChange={(e) => set("subDomainOther", e.target.value)}
                        placeholder="e.g. SaaS Sales"
                        className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    )}
                  </>
                ) : (
                  <input
                    value={form.subDomainOther}
                    onChange={(e) => set("subDomainOther", e.target.value)}
                    placeholder="Pick a category above first"
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Current fixed CTC</label>
                <select
                  value={form.currentFixedCtc}
                  onChange={(e) => set("currentFixedCtc", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <option value="">Select...</option>
                  {ctcOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Total experience</label>
                <select
                  value={form.totalExperienceYears}
                  onChange={(e) => set("totalExperienceYears", e.target.value)}
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
                <label className="block text-xs font-medium text-slate-600 mb-1">When can they join?</label>
                <select
                  value={form.noticePeriod}
                  onChange={(e) => set("noticePeriod", e.target.value)}
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Current job title</label>
                <input
                  value={form.currentJobTitle}
                  onChange={(e) => set("currentJobTitle", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Current employer</label>
                <input
                  value={form.currentEmployer}
                  onChange={(e) => set("currentEmployer", e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employment status</label>
                <select
                  value={form.employmentStatus}
                  onChange={(e) => set("employmentStatus", e.target.value)}
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Current industry</label>
                <select
                  value={form.currentIndustry}
                  onChange={(e) => set("currentIndustry", e.target.value)}
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

              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Previous industries <span className="text-slate-400">(comma-separated)</span>
                </label>
                <input
                  value={form.previousIndustries}
                  onChange={(e) => set("previousIndustries", e.target.value)}
                  placeholder="e.g. EdTech, Retail Sales"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">IC or leading a team?</label>
                <select
                  value={form.roleType}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, roleType: e.target.value, teamSize: e.target.value === "Leading a Team" ? f.teamSize : "" }))
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

              {form.roleType === "Leading a Team" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Team size</label>
                  <select
                    value={form.teamSize}
                    onChange={(e) => set("teamSize", e.target.value)}
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
            </div>

            {error && <p className="px-5 text-[12px] text-red-600 mb-2">{error}</p>}

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 sticky bottom-0 bg-white">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-[12px] font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg px-3.5 py-1.5 disabled:opacity-60"
              >
                {saving && <Loader2 className="w-3 h-3 animate-spin" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
