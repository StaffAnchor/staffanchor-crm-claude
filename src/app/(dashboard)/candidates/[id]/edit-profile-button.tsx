"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Pencil, Loader2, X, Upload, Download } from "lucide-react";
import ResumeViewerInline from "./resume-viewer-inline";
import {
  cityOptions,
  cityStateMap,
  ctcOptions,
  level1OptionsForProfileType,
  secondarySpecializationGroups,
  primaryAsSecondaryLabel,
  subDomainsForPractice,
  otherB2BSubDomains,
  experienceOptions,
  noticePeriodOptions,
  employmentStatusOptions,
  industryOptions,
  roleTypeOptions,
  teamSizeOptions,
  roleLevelOptions,
  currencyOptions,
  dealSizeBandsFor,
  b2bSalesMotionTypeGroups,
  clientProfileOptions,
  salesCycleOptions,
  sellingStyleOptions,
  salesMotionOptions,
  customerSegmentOptions,
  funnelStageOptions,
  geographicScopeOptions,
  internationalRegionOptions,
  workModeOptions,
  relocationOptions,
  travelPreferenceOptions,
  highestQualificationOptions,
  achievementBandOptions,
  type CurrencyValue,
} from "@/lib/candidate-options";

type Candidate = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  current_location: string | null;
  linkedin_url: string | null;
  resume_file_url: string | null;
  category: string | null;
  sub_domain: string | null;
  secondary_sub_domains: string[] | null;
  current_fixed_ctc: number | null;
  current_variable_ctc: number | null;
  esops_held: boolean | null;
  total_experience_years: number | null;
  notice_period: string | null;
  expected_fixed_ctc: number | null;
  expected_variable_ctc: number | null;
  current_job_title: string | null;
  current_employer: string | null;
  current_employment_status: string | null;
  current_industry: string | null;
  industries: string[] | null;
  highest_qualification: string | null;
  skills: string | null;
  work_mode: string | null;
  open_to_relocation: string | null;
  status: string;
  segment_data: Record<string, unknown> | null;
};

function seg(data: Record<string, unknown> | null | undefined, key: string): string {
  const v = data?.[key];
  return v === undefined || v === null ? "" : String(v);
}
function segArr(data: Record<string, unknown> | null | undefined, key: string): string[] {
  const v = data?.[key];
  return Array.isArray(v) ? v.map(String) : [];
}
function segNumArr(data: Record<string, unknown> | null | undefined, key: string): string[] {
  const v = data?.[key];
  return Array.isArray(v) ? v.map((n) => String(n)) : ["", "", "", ""];
}

// Mirrors public.submit_candidate's v_is_complete check in Supabase exactly
// (same field list) -- that RPC is the authoritative server-side gate for
// self-service candidate submissions, so a recruiter marking a profile
// "registered" here must not use a looser bar than the one candidates
// themselves are held to. Previously this omitted expected_fixed_ctc,
// linkedin_url, resume_file_url, work_mode, and open_to_relocation, which let
// a recruiter flip status to "registered" on a profile that was still
// missing mandatory Stage 3 fields -- fixed by matching the RPC's list.
const MANDATORY_FIELDS_COMPLETE = (f: {
  full_name: string;
  phone: string;
  city: string;
  cityOther: string;
  currentFixedCtc: string;
  expectedFixedCtc: string;
  totalExperienceYears: string;
  noticePeriod: string;
  category: string;
  subDomain: string;
  subDomainOther: string;
  otherB2BSubDomain: string;
  otherB2BSubDomainCustom: string;
  currentJobTitle: string;
  currentEmployer: string;
  employmentStatus: string;
  currentIndustry: string;
  roleType: string;
  teamSize: string;
  linkedinUrl: string;
  resumeFileUrl: string | null;
  highestQualification: string;
  highestQualificationOther: string;
  workMode: string;
  openToRelocation: string;
}) => {
  if (!f.full_name.trim() || !f.phone.trim()) return false;
  if (!f.city || (f.city === "Other" && !f.cityOther.trim())) return false;
  if (!f.currentFixedCtc || !f.expectedFixedCtc || !f.totalExperienceYears || !f.noticePeriod) return false;
  if (!f.category) return false;
  if (!f.subDomain || (f.subDomain === "Other" && !f.subDomainOther.trim())) return false;
  if (f.subDomain === "Other B2B") {
    if (!f.otherB2BSubDomain) return false;
    if (f.otherB2BSubDomain === "Other" && !f.otherB2BSubDomainCustom.trim()) return false;
  }
  if (!f.currentJobTitle.trim() || !f.currentEmployer.trim()) return false;
  if (!f.employmentStatus || !f.currentIndustry) return false;
  if (!f.roleType) return false;
  if (f.roleType === "Leading a Team" && !f.teamSize) return false;
  if (!f.linkedinUrl.trim() || !f.resumeFileUrl) return false;
  if (!f.highestQualification || (f.highestQualification === "Other" && !f.highestQualificationOther.trim())) return false;
  if (!f.workMode || !f.openToRelocation) return false;
  return true;
};

const SECTION_LABEL = "block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5";
const FIELD_LABEL = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";
const INPUT_CLS = "w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm";

function CheckboxGroup({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (opt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onToggle(opt)}
            className={`text-[12px] px-2.5 py-1 rounded-full border transition-colors ${
              active
                ? "bg-blue-600 border-blue-600 text-white"
                : "bg-white dark:bg-slate-900 border-slate-300 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function EditProfileButton({
  candidate,
  resumeSignedUrl,
  resumeFileName,
}: {
  candidate: Candidate;
  // When present, the edit modal embeds the resume inline on the left,
  // alongside the editable fields on the right -- so a recruiter on a live
  // call can keep the CV open while updating the profile in real time,
  // instead of the old behavior where opening the resume preview covered
  // and disabled the rest of the page. Optional: candidates without a
  // resume on file just get the original single-column form.
  resumeSignedUrl?: string | null;
  resumeFileName?: string | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const hasResume = Boolean(resumeSignedUrl && resumeFileName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const knownCity = candidate.current_location
    ? Object.keys(cityStateMap).find((c) => candidate.current_location?.startsWith(c))
    : undefined;
  const sd = candidate.segment_data ?? null;
  const roleTypeRaw = seg(sd, "role_type");
  const icTargets = segNumArr(sd, "ic_targets");
  const quota = segNumArr(sd, "quota");
  const teamTargets = segNumArr(sd, "team_targets");
  const teamQuota = segNumArr(sd, "team_quota");
  const knownQualification =
    candidate.highest_qualification && highestQualificationOptions.includes(candidate.highest_qualification);
  const knownCurrentIndustry = candidate.current_industry && industryOptions.includes(candidate.current_industry);

  const [form, setForm] = useState({
    full_name: candidate.full_name ?? "",
    email: candidate.email ?? "",
    phone: candidate.phone ?? "",
    city: knownCity ?? (candidate.current_location ? "Other" : ""),
    cityOther: knownCity ? "" : candidate.current_location ?? "",
    linkedinUrl: candidate.linkedin_url ?? "",

    category: candidate.category ?? "",
    subDomain: candidate.sub_domain ?? "",
    subDomainOther: "",
    // "Other B2B" specify sub-field -- mirrors the same two-level structure
    // and required-ness as jobs-staffanchor's candidate-facing wizard and
    // the CRM's own Create Candidate form. This screen previously had no
    // equivalent field at all: a recruiter could pick "Other B2B" as
    // Primary Specialization and save with no way to capture what that
    // background actually was.
    otherB2BSubDomain: (() => {
      const raw = seg(sd, "other_b2b_subdomain");
      if (!raw) return "";
      return otherB2BSubDomains.includes(raw) ? raw : "Other";
    })(),
    otherB2BSubDomainCustom: (() => {
      const raw = seg(sd, "other_b2b_subdomain");
      return raw && !otherB2BSubDomains.includes(raw) ? raw : "";
    })(),
    secondarySubDomains: candidate.secondary_sub_domains ?? [],

    currentFixedCtc: candidate.current_fixed_ctc != null ? String(candidate.current_fixed_ctc) : "",
    currentVariableCtc: candidate.current_variable_ctc != null ? String(candidate.current_variable_ctc) : "",
    esopsHeld: candidate.esops_held ?? false,
    totalExperienceYears: candidate.total_experience_years != null ? String(candidate.total_experience_years) : "",
    noticePeriod: candidate.notice_period ?? "",
    expectedFixedCtc: candidate.expected_fixed_ctc != null ? String(candidate.expected_fixed_ctc) : "",
    expectedVariableCtc: candidate.expected_variable_ctc != null ? String(candidate.expected_variable_ctc) : "",
    currentJobTitle: candidate.current_job_title ?? "",
    currentEmployer: candidate.current_employer ?? "",
    employmentStatus: candidate.current_employment_status ?? "",
    highestQualification: knownQualification ? (candidate.highest_qualification as string) : candidate.highest_qualification ? "Other" : "",
    highestQualificationOther: !knownQualification ? candidate.highest_qualification ?? "" : "",
    skills: candidate.skills ?? "",
    workMode: candidate.work_mode ?? "",
    openToRelocation: candidate.open_to_relocation ?? "",
    travelPreference: seg(sd, "travel_preference"),

    roleLevel: seg(sd, "role_level"),
    roleType:
      roleTypeRaw === "Team Lead" ? "Leading a Team" : roleTypeRaw === "IC" ? "Individual Contributor (IC)" : "",
    teamSize: seg(sd, "team_size"),

    dealCurrency: (seg(sd, "deal_size_currency") || seg(sd, "ticket_currency")) as CurrencyValue | "",
    dealSizeBand: seg(sd, "deal_size") || seg(sd, "ticket"),
    cycle: seg(sd, "cycle"),
    style: seg(sd, "style"),
    motion: segArr(sd, "motion"),
    segment: seg(sd, "segment"),
    funnel: seg(sd, "funnel"),
    scope: seg(sd, "scope"),
    scopeDetail: seg(sd, "scope_detail"),
    scopeRegions: segArr(sd, "scope_regions"),

    b2bSalesMotionType: segArr(sd, "b2b_sales_motion_type"),
    buyerPersona: seg(sd, "buyer_persona"),

    hasIcTarget: icTargets.some((v) => v !== "") ? "Yes" : "No",
    icTargetCurrency: seg(sd, "ic_target_currency") as CurrencyValue | "",
    teamTargetCurrency: seg(sd, "team_target_currency") as CurrencyValue | "",
    icTargetQ1: icTargets[0] ?? "",
    icTargetQ2: icTargets[1] ?? "",
    icTargetQ3: icTargets[2] ?? "",
    icTargetQ4: icTargets[3] ?? "",
    quotaQ1: quota[0] ?? "",
    quotaQ2: quota[1] ?? "",
    quotaQ3: quota[2] ?? "",
    quotaQ4: quota[3] ?? "",
    teamTargetQ1: teamTargets[0] ?? "",
    teamTargetQ2: teamTargets[1] ?? "",
    teamTargetQ3: teamTargets[2] ?? "",
    teamTargetQ4: teamTargets[3] ?? "",
    teamQuotaQ1: teamQuota[0] ?? "",
    teamQuotaQ2: teamQuota[1] ?? "",
    teamQuotaQ3: teamQuota[2] ?? "",
    teamQuotaQ4: teamQuota[3] ?? "",

    currentIndustry: knownCurrentIndustry ? (candidate.current_industry as string) : candidate.current_industry ? "Other" : "",
    currentIndustryOther: !knownCurrentIndustry ? candidate.current_industry ?? "" : "",
    previousIndustries: (candidate.industries ?? [])
      .filter((i) => i !== candidate.current_industry)
      .join(", "),
  });

  const subDomainOptions = level1OptionsForProfileType(form.category || null);
  // Secondary specializations are a cross-Profile-Type list (mirrors
  // jobs-staffanchor's ApplyForm exactly), not "whatever's left over from
  // the primary dropdown" -- primaryAsSecondaryLabel handles the
  // Other -> Other (B2B)/(B2C)/(Non-Sales) disambiguation so the current
  // primary selection is correctly excluded from its own secondary list.
  const secondarySubDomainChoices = secondarySpecializationGroups()
    .flatMap((g) => g.options)
    .filter((d) => d !== primaryAsSecondaryLabel(form.category || null, form.subDomain));
  const isSales = form.category === "b2b_sales" || form.category === "b2c_sales";
  const isB2B = form.category === "b2b_sales";
  const isB2C = form.category === "b2c_sales";
  const isTeamLead = form.roleType === "Leading a Team";

  // Tiered Passport Readiness Metric -- mirrors the same Basic/Good/Excellent/
  // Premium language shown to candidates in the public "Build Your Profile"
  // wizard (Sales Passport), so a recruiter editing a profile here sees the
  // same vocabulary a candidate or hiring manager would. Purely a read-only
  // gauge over the fields already in this form; no new fields, no change to
  // what gets saved.
  const READINESS_FIELDS_BASE: (keyof typeof form)[] = [
    "full_name",
    "phone",
    "currentFixedCtc",
    "totalExperienceYears",
    "noticePeriod",
    "category",
    "subDomain",
    "currentJobTitle",
    "currentEmployer",
    "employmentStatus",
    "currentIndustry",
    "roleType",
    "highestQualification",
    "skills",
    "workMode",
  ];
  const readinessApplicableFields: (keyof typeof form)[] = [...READINESS_FIELDS_BASE];
  if (isSales) {
    readinessApplicableFields.push("dealCurrency", "dealSizeBand");
    readinessApplicableFields.push(isTeamLead ? "teamTargetQ4" : "icTargetQ4");
  }
  const readinessFilledCount = readinessApplicableFields.filter((k) => {
    const v = form[k];
    return Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== "";
  }).length;
  const readinessScore = Math.round((readinessFilledCount / readinessApplicableFields.length) * 100);
  const readinessTier: "Basic" | "Good" | "Excellent" | "Premium" =
    readinessScore >= 90 ? "Premium" : readinessScore >= 65 ? "Excellent" : readinessScore >= 35 ? "Good" : "Basic";
  const READINESS_BADGE: Record<typeof readinessTier, string> = {
    Basic: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    Good: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    Excellent: "bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
    Premium: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  };

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function toggleInArray(key: "secondarySubDomains" | "motion" | "scopeRegions" | "b2bSalesMotionType", opt: string) {
    setForm((f) => {
      const arr = f[key] as string[];
      return {
        ...f,
        [key]: arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt],
      };
    });
  }

  async function handleSave() {
    setError(null);

    // "Other B2B" specify field is required once picked as Primary
    // Specialization -- this screen previously let it through blank
    // (handleSave had no gate at all on it), which is exactly how recent
    // "Other B2B" candidates ended up on record with no actual B2B
    // background captured. Block the save the same way jobs-staffanchor's
    // wizard and the CRM's own Create Candidate form already do.
    if (form.subDomain === "Other B2B" && !form.otherB2BSubDomain) {
      setError("Please specify the B2B specialization, or choose a different Primary Specialization.");
      return;
    }
    if (form.subDomain === "Other B2B" && form.otherB2BSubDomain === "Other" && !form.otherB2BSubDomainCustom.trim()) {
      setError("Please specify the B2B specialization.");
      return;
    }

    setSaving(true);

    let resumeFileUrl = candidate.resume_file_url;
    if (resumeFile) {
      const path = `${crypto.randomUUID()}-${resumeFile.name}`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(path, resumeFile, {
        contentType: resumeFile.type || undefined,
      });
      if (uploadError) {
        setError(`Resume upload failed: ${uploadError.message}`);
        setSaving(false);
        return;
      }
      resumeFileUrl = path;
    }

    const resolvedCity =
      form.city === "Other" ? form.cityOther.trim() : form.city ? `${form.city}, ${cityStateMap[form.city]}` : "";
    const resolvedSubDomain = form.subDomain === "Other" ? form.subDomainOther.trim() : form.subDomain;
    const resolvedQualification =
      form.highestQualification === "Other" ? form.highestQualificationOther.trim() : form.highestQualification;
    const resolvedCurrentIndustry =
      form.currentIndustry === "Other" ? form.currentIndustryOther.trim() : form.currentIndustry;

    const previousList = form.previousIndustries
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const industries = Array.from(new Set([resolvedCurrentIndustry, ...previousList].filter(Boolean)));

    // segment_data: mirrors the same keys the public "Build Your Profile" wizard
    // writes, so both entry points stay compatible with anything reading
    // segment_data downstream (AI summary, matching, etc.)
    const segmentData: Record<string, unknown> = { ...(candidate.segment_data ?? {}) };
    if (form.roleLevel) segmentData.role_level = form.roleLevel;
    else delete segmentData.role_level;
    if (form.roleType) segmentData.role_type = form.roleType === "Leading a Team" ? "Team Lead" : "IC";
    else delete segmentData.role_type;
    if (isTeamLead && form.teamSize) segmentData.team_size = form.teamSize;
    else delete segmentData.team_size;
    if (form.travelPreference) segmentData.travel_preference = form.travelPreference;
    else delete segmentData.travel_preference;

    const icTargetNums = [form.icTargetQ1, form.icTargetQ2, form.icTargetQ3, form.icTargetQ4]
      .filter((v) => v.trim() !== "")
      .map(Number);
    const icAchievement = [form.quotaQ1, form.quotaQ2, form.quotaQ3, form.quotaQ4].filter((v) => v.trim() !== "");
    const teamTargetNums = [form.teamTargetQ1, form.teamTargetQ2, form.teamTargetQ3, form.teamTargetQ4]
      .filter((v) => v.trim() !== "")
      .map(Number);
    const teamAchievement = [form.teamQuotaQ1, form.teamQuotaQ2, form.teamQuotaQ3, form.teamQuotaQ4].filter(
      (v) => v.trim() !== ""
    );

    delete segmentData.team_targets;
    delete segmentData.team_quota;
    delete segmentData.team_target_currency;
    delete segmentData.ic_targets;
    delete segmentData.quota;
    delete segmentData.ic_target_currency;
    delete segmentData.total_targets;

    if (isTeamLead) {
      if (teamTargetNums.length) segmentData.team_targets = teamTargetNums;
      if (teamAchievement.length) segmentData.team_quota = teamAchievement;
      if (form.teamTargetCurrency) segmentData.team_target_currency = form.teamTargetCurrency;
      if (form.hasIcTarget === "Yes") {
        if (icTargetNums.length) segmentData.ic_targets = icTargetNums;
        if (icAchievement.length) segmentData.quota = icAchievement;
        if (form.icTargetCurrency) segmentData.ic_target_currency = form.icTargetCurrency;
        if (
          icTargetNums.length === 4 &&
          teamTargetNums.length === 4 &&
          form.icTargetCurrency &&
          form.icTargetCurrency === form.teamTargetCurrency
        ) {
          segmentData.total_targets = teamTargetNums.map((t, i) => t + icTargetNums[i]);
        }
      }
    } else {
      if (icTargetNums.length) segmentData.ic_targets = icTargetNums;
      if (icAchievement.length) segmentData.quota = icAchievement;
      if (form.icTargetCurrency) segmentData.ic_target_currency = form.icTargetCurrency;
    }

    delete segmentData.deal_size;
    delete segmentData.deal_size_currency;
    delete segmentData.cycle;
    delete segmentData.style;
    delete segmentData.motion;
    delete segmentData.segment;
    delete segmentData.ticket;
    delete segmentData.ticket_currency;
    delete segmentData.funnel;
    delete segmentData.scope;
    delete segmentData.scope_detail;
    delete segmentData.scope_regions;
    delete segmentData.b2b_sales_motion_type;
    delete segmentData.buyer_persona;
    delete segmentData.other_b2b_subdomain;

    if (form.subDomain === "Other B2B" && form.otherB2BSubDomain) {
      segmentData.other_b2b_subdomain =
        form.otherB2BSubDomain === "Other" ? form.otherB2BSubDomainCustom.trim() : form.otherB2BSubDomain;
    }

    if (isB2B) {
      Object.assign(segmentData, {
        deal_size: form.dealSizeBand || undefined,
        deal_size_currency: form.dealCurrency || undefined,
        cycle: form.cycle || undefined,
        style: form.style || undefined,
        motion: form.motion.length ? form.motion : undefined,
        segment: form.segment || undefined,
        b2b_sales_motion_type: form.b2bSalesMotionType.length ? form.b2bSalesMotionType : undefined,
        buyer_persona: form.buyerPersona || undefined,
      });
    } else if (isB2C) {
      Object.assign(segmentData, {
        ticket: form.dealSizeBand || undefined,
        ticket_currency: form.dealCurrency || undefined,
        funnel: form.funnel || undefined,
        scope: form.scope || undefined,
        scope_detail:
          form.scope === "Single City" || form.scope === "Multi-City" || form.scope === "Regional (Multiple States)"
            ? form.scopeDetail || undefined
            : undefined,
        scope_regions: form.scope === "International / Global" ? form.scopeRegions : undefined,
      });
    }

    // AHT / Daily Call Target / Daily Talk Time / Lead Source are obsolete --
    // every B2B Sales Motion now uses the same shared field set (Selling
    // Style, Deal Size, Sales Cycle, Buyer Persona) instead of a separate
    // Inside-Sales-only block, mirroring the candidate-facing wizard.
    delete segmentData.aht;
    delete segmentData.daily_call_target;
    delete segmentData.daily_talk_time;
    delete segmentData.lead_sources;

    const isComplete = MANDATORY_FIELDS_COMPLETE({
      full_name: form.full_name,
      phone: form.phone,
      city: form.city,
      cityOther: form.cityOther,
      currentFixedCtc: form.currentFixedCtc,
      expectedFixedCtc: form.expectedFixedCtc,
      totalExperienceYears: form.totalExperienceYears,
      noticePeriod: form.noticePeriod,
      category: form.category,
      subDomain: form.subDomain,
      subDomainOther: form.subDomainOther,
      otherB2BSubDomain: form.otherB2BSubDomain,
      otherB2BSubDomainCustom: form.otherB2BSubDomainCustom,
      currentJobTitle: form.currentJobTitle,
      currentEmployer: form.currentEmployer,
      employmentStatus: form.employmentStatus,
      currentIndustry: form.currentIndustry,
      roleType: form.roleType,
      teamSize: form.teamSize,
      linkedinUrl: form.linkedinUrl,
      resumeFileUrl,
      highestQualification: form.highestQualification,
      highestQualificationOther: form.highestQualificationOther,
      workMode: form.workMode,
      openToRelocation: form.openToRelocation,
    });

    const update: Record<string, unknown> = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      current_location: resolvedCity || null,
      linkedin_url: form.linkedinUrl.trim() || null,
      resume_file_url: resumeFileUrl,
      category: form.category || null,
      sub_domain: resolvedSubDomain || null,
      secondary_sub_domains: form.secondarySubDomains,
      current_fixed_ctc: form.currentFixedCtc ? Number(form.currentFixedCtc) : null,
      current_variable_ctc: form.currentVariableCtc ? Number(form.currentVariableCtc) : null,
      esops_held: form.esopsHeld,
      total_experience_years: form.totalExperienceYears ? Number(form.totalExperienceYears) : null,
      notice_period: form.noticePeriod || null,
      expected_fixed_ctc: form.expectedFixedCtc ? Number(form.expectedFixedCtc) : null,
      expected_variable_ctc: form.expectedVariableCtc ? Number(form.expectedVariableCtc) : null,
      current_job_title: form.currentJobTitle.trim() || null,
      current_employer: form.currentEmployer.trim() || null,
      current_employment_status: form.employmentStatus || null,
      current_industry: resolvedCurrentIndustry || null,
      industries,
      highest_qualification: resolvedQualification || null,
      skills: form.skills.trim() || null,
      work_mode: form.workMode || null,
      open_to_relocation: form.openToRelocation || null,
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
        className="flex items-center gap-1.5 text-[12px] font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-ros-md px-3 py-1.5 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
      >
        <Pencil className="w-3 h-3" /> Edit profile
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !saving && setOpen(false)}>
          <div
            className={`bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-md w-full flex overflow-hidden ${
              hasResume ? "max-w-6xl h-[88vh]" : "max-w-3xl max-h-[90vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {hasResume && (
              <div className="hidden lg:flex flex-col w-[42%] shrink-0 border-r border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate pr-4">{resumeFileName}</p>
                  <a
                    href={resumeSignedUrl!}
                    download={resumeFileName!}
                    className="flex items-center gap-1 text-[12px] text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </div>
                <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800/50">
                  <ResumeViewerInline signedUrl={resumeSignedUrl!} fileName={resumeFileName!} />
                </div>
              </div>
            )}

            <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div className="flex items-center gap-2">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Edit profile</h3>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${READINESS_BADGE[readinessTier]}`}>
                  {readinessTier} · {readinessScore}%
                </span>
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 dark:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* --- Basic Info --- */}
              <section>
                <span className={SECTION_LABEL}>Basic Information</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={FIELD_LABEL}>Full name</label>
                    <input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Email</label>
                    <input value={form.email} onChange={(e) => set("email", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Phone</label>
                    <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>LinkedIn URL</label>
                    <input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Location</label>
                    <select value={form.city} onChange={(e) => set("city", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {cityOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                    {form.city === "Other" && (
                      <input
                        value={form.cityOther}
                        onChange={(e) => set("cityOther", e.target.value)}
                        placeholder="City, State"
                        className={`${INPUT_CLS} mt-2`}
                      />
                    )}
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Resume</label>
                    {candidate.resume_file_url && !resumeFile && (
                      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-1 truncate">Currently on file</p>
                    )}
                    {resumeFile && <p className="text-[12px] text-slate-700 dark:text-slate-300 mb-1 truncate">{resumeFile.name} (replacing)</p>}
                    <label className="flex items-center gap-1.5 text-[12px] text-slate-600 dark:text-slate-400 border border-dashed border-slate-300 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 w-fit">
                      <Upload className="w-3 h-3" />
                      {candidate.resume_file_url ? "Replace resume" : "Upload resume"}
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                </div>
              </section>

              {/* --- Function / Domain & Specialization --- */}
              <section>
                <span className={SECTION_LABEL}>Function / Domain &amp; Specialization</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={FIELD_LABEL}>Current Profile Type</label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value, subDomain: "", secondarySubDomains: [] }))}
                      className={INPUT_CLS}
                    >
                      <option value="">Select...</option>
                      <option value="b2b_sales">B2B Sales</option>
                      <option value="b2c_sales">B2C Sales</option>
                      <option value="non_sales">Non-Sales</option>
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Primary Specialization</label>
                    {subDomainOptions.length > 0 ? (
                      <>
                        <select value={form.subDomain} onChange={(e) => set("subDomain", e.target.value)} className={INPUT_CLS}>
                          <option value="">Select...</option>
                          {subDomainOptions.map((d) => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                        {form.subDomain === "Other" && (
                          <input
                            value={form.subDomainOther}
                            onChange={(e) => set("subDomainOther", e.target.value)}
                            placeholder="e.g. SaaS Sales"
                            className={`${INPUT_CLS} mt-2`}
                          />
                        )}
                        {form.subDomain === "Other B2B" && (
                          <>
                            <p className="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                              We actively focus on Enterprise Tech and Industrial &amp; Infrastructure, but want to
                              place great candidates from every B2B background — specify which.
                            </p>
                            <select
                              value={form.otherB2BSubDomain}
                              onChange={(e) => set("otherB2BSubDomain", e.target.value)}
                              className={`${INPUT_CLS} mt-1.5`}
                            >
                              <option value="">Select...</option>
                              {subDomainsForPractice("Other B2B").map((d) => (
                                <option key={d} value={d}>{d}</option>
                              ))}
                            </select>
                            {form.otherB2BSubDomain === "Other" && (
                              <input
                                value={form.otherB2BSubDomainCustom}
                                onChange={(e) => set("otherB2BSubDomainCustom", e.target.value)}
                                placeholder="e.g. EdTech Sales"
                                className={`${INPUT_CLS} mt-2`}
                              />
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <input
                        value={form.subDomainOther}
                        onChange={(e) => set("subDomainOther", e.target.value)}
                        placeholder="Pick a category above first"
                        className={INPUT_CLS}
                      />
                    )}
                  </div>
                  {secondarySubDomainChoices.length > 0 && (
                    <div className="col-span-2">
                      <label className={FIELD_LABEL}>Secondary specializations (optional)</label>
                      <CheckboxGroup
                        options={secondarySubDomainChoices}
                        selected={form.secondarySubDomains}
                        onToggle={(o) => toggleInArray("secondarySubDomains", o)}
                      />
                    </div>
                  )}
                  <div>
                    <label className={FIELD_LABEL}>Role level</label>
                    <select value={form.roleLevel} onChange={(e) => set("roleLevel", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {roleLevelOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>IC or leading a team?</label>
                    <select
                      value={form.roleType}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, roleType: e.target.value, teamSize: e.target.value === "Leading a Team" ? f.teamSize : "" }))
                      }
                      className={INPUT_CLS}
                    >
                      <option value="">Select...</option>
                      {roleTypeOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  {isTeamLead && (
                    <div>
                      <label className={FIELD_LABEL}>Team size</label>
                      <select value={form.teamSize} onChange={(e) => set("teamSize", e.target.value)} className={INPUT_CLS}>
                        <option value="">Select...</option>
                        {teamSizeOptions.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </section>

              {/* --- Career & Compensation --- */}
              <section>
                <span className={SECTION_LABEL}>Career &amp; Compensation</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={FIELD_LABEL}>Current job title</label>
                    <input value={form.currentJobTitle} onChange={(e) => set("currentJobTitle", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Current employer</label>
                    <input value={form.currentEmployer} onChange={(e) => set("currentEmployer", e.target.value)} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Employment status</label>
                    <select value={form.employmentStatus} onChange={(e) => set("employmentStatus", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {employmentStatusOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Total experience</label>
                    <select value={form.totalExperienceYears} onChange={(e) => set("totalExperienceYears", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {experienceOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Current fixed CTC</label>
                    <select value={form.currentFixedCtc} onChange={(e) => set("currentFixedCtc", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {ctcOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Current variable CTC (optional)</label>
                    <select value={form.currentVariableCtc} onChange={(e) => set("currentVariableCtc", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {ctcOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Expected fixed CTC</label>
                    <select value={form.expectedFixedCtc} onChange={(e) => set("expectedFixedCtc", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {ctcOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Expected variable CTC (optional)</label>
                    <select value={form.expectedVariableCtc} onChange={(e) => set("expectedVariableCtc", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {ctcOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="esops"
                      checked={form.esopsHeld}
                      onChange={(e) => set("esopsHeld", e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    <label htmlFor="esops" className="text-sm text-slate-700 dark:text-slate-300">Holds ESOPs</label>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>When can they join?</label>
                    <select value={form.noticePeriod} onChange={(e) => set("noticePeriod", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {noticePeriodOptions.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Highest qualification</label>
                    <select value={form.highestQualification} onChange={(e) => set("highestQualification", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {highestQualificationOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                    {form.highestQualification === "Other" && (
                      <input
                        value={form.highestQualificationOther}
                        onChange={(e) => set("highestQualificationOther", e.target.value)}
                        placeholder="Specify qualification"
                        className={`${INPUT_CLS} mt-2`}
                      />
                    )}
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Work mode</label>
                    <select value={form.workMode} onChange={(e) => set("workMode", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {workModeOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Open to relocation?</label>
                    <select value={form.openToRelocation} onChange={(e) => set("openToRelocation", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {relocationOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>Travel preference</label>
                    <select value={form.travelPreference} onChange={(e) => set("travelPreference", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {travelPreferenceOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className={FIELD_LABEL}>
                      Skills <span className="text-slate-400">(comma-separated)</span>
                    </label>
                    <input
                      value={form.skills}
                      onChange={(e) => set("skills", e.target.value)}
                      placeholder="e.g. Salesforce, Negotiation, Cold Calling"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </section>

              {/* --- Sales Specialization (conditional) --- */}
              {isSales && (
                <section>
                  <span className={SECTION_LABEL}>Sales Specialization</span>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={FIELD_LABEL}>{isB2B ? "Deal size currency" : "Ticket size currency"}</label>
                      <select
                        value={form.dealCurrency}
                        onChange={(e) => setForm((f) => ({ ...f, dealCurrency: e.target.value as CurrencyValue | "", dealSizeBand: "" }))}
                        className={INPUT_CLS}
                      >
                        <option value="">Select...</option>
                        {currencyOptions.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={FIELD_LABEL}>{isB2B ? "Typical deal size" : "Typical ticket size"}</label>
                      <select value={form.dealSizeBand} onChange={(e) => set("dealSizeBand", e.target.value)} className={INPUT_CLS}>
                        <option value="">Select...</option>
                        {dealSizeBandsFor(form.category, form.dealCurrency).map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    {isB2B && (
                      <>
                        <div>
                          <label className={FIELD_LABEL}>Sales cycle length</label>
                          <select value={form.cycle} onChange={(e) => set("cycle", e.target.value)} className={INPUT_CLS}>
                            <option value="">Select...</option>
                            {salesCycleOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={FIELD_LABEL}>Selling style</label>
                          <select value={form.style} onChange={(e) => set("style", e.target.value)} className={INPUT_CLS}>
                            <option value="">Select...</option>
                            {sellingStyleOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={FIELD_LABEL}>Customer segment</label>
                          <select value={form.segment} onChange={(e) => set("segment", e.target.value)} className={INPUT_CLS}>
                            <option value="">Select...</option>
                            {customerSegmentOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className={FIELD_LABEL}>Sales motion</label>
                          <CheckboxGroup options={salesMotionOptions} selected={form.motion} onToggle={(o) => toggleInArray("motion", o)} />
                        </div>
                      </>
                    )}

                    {isB2C && (
                      <>
                        <div>
                          <label className={FIELD_LABEL}>Funnel stage</label>
                          <select value={form.funnel} onChange={(e) => set("funnel", e.target.value)} className={INPUT_CLS}>
                            <option value="">Select...</option>
                            {funnelStageOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={FIELD_LABEL}>Geographic scope</label>
                          <select value={form.scope} onChange={(e) => set("scope", e.target.value)} className={INPUT_CLS}>
                            <option value="">Select...</option>
                            {geographicScopeOptions.map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                          </select>
                        </div>
                        {(form.scope === "Single City" || form.scope === "Multi-City" || form.scope === "Regional (Multiple States)") && (
                          <div className="col-span-2">
                            <label className={FIELD_LABEL}>Scope detail</label>
                            <input
                              value={form.scopeDetail}
                              onChange={(e) => set("scopeDetail", e.target.value)}
                              placeholder="e.g. Delhi NCR, Maharashtra"
                              className={INPUT_CLS}
                            />
                          </div>
                        )}
                        {form.scope === "International / Global" && (
                          <div className="col-span-2">
                            <label className={FIELD_LABEL}>Regions covered</label>
                            <CheckboxGroup
                              options={internationalRegionOptions}
                              selected={form.scopeRegions}
                              onToggle={(o) => toggleInArray("scopeRegions", o)}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {isB2B && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">
                        Sales Motion Type &amp; Buyer Persona
                      </span>
                      <div className="space-y-3">
                        {b2bSalesMotionTypeGroups.map(({ group, options }) => (
                          <div key={group}>
                            <label className="block text-[11px] font-medium text-slate-400 dark:text-slate-500 mb-1">
                              {group}
                            </label>
                            <CheckboxGroup
                              options={[...options]}
                              selected={form.b2bSalesMotionType}
                              onToggle={(o) => toggleInArray("b2bSalesMotionType", o)}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="mt-3">
                        <label className={FIELD_LABEL}>Primary buyer persona</label>
                        <select
                          value={form.buyerPersona}
                          onChange={(e) => set("buyerPersona", e.target.value)}
                          className={INPUT_CLS}
                        >
                          <option value="">Select...</option>
                          {clientProfileOptions.map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2.5">
                      Quarterly Targets &amp; Achievement (last 4 quarters)
                    </span>
                    {isTeamLead && (
                      <div className="mb-4">
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className={FIELD_LABEL}>Team target currency</label>
                            <select
                              value={form.teamTargetCurrency}
                              onChange={(e) => set("teamTargetCurrency", e.target.value as CurrencyValue | "")}
                              className={INPUT_CLS}
                            >
                              <option value="">Select...</option>
                              {currencyOptions.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          {(["teamTargetQ1", "teamTargetQ2", "teamTargetQ3", "teamTargetQ4"] as const).map((k, i) => (
                            <div key={k}>
                              <label className={FIELD_LABEL}>Team target Q{i + 1}</label>
                              <input value={form[k]} onChange={(e) => set(k, e.target.value)} className={INPUT_CLS} placeholder="0" />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {(["teamQuotaQ1", "teamQuotaQ2", "teamQuotaQ3", "teamQuotaQ4"] as const).map((k, i) => (
                            <div key={k}>
                              <label className={FIELD_LABEL}>Team achv. Q{i + 1}</label>
                              <select value={form[k]} onChange={(e) => set(k, e.target.value)} className={INPUT_CLS}>
                                <option value="">Select...</option>
                                {achievementBandOptions.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <label className={FIELD_LABEL}>Also carries an individual target?</label>
                          <select
                            value={form.hasIcTarget}
                            onChange={(e) => set("hasIcTarget", e.target.value)}
                            className={`${INPUT_CLS} max-w-[160px]`}
                          >
                            <option value="No">No</option>
                            <option value="Yes">Yes</option>
                          </select>
                        </div>
                      </div>
                    )}
                    {(!isTeamLead || form.hasIcTarget === "Yes") && (
                      <div>
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div>
                            <label className={FIELD_LABEL}>Individual target currency</label>
                            <select
                              value={form.icTargetCurrency}
                              onChange={(e) => set("icTargetCurrency", e.target.value as CurrencyValue | "")}
                              className={INPUT_CLS}
                            >
                              <option value="">Select...</option>
                              {currencyOptions.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-3 mb-3">
                          {(["icTargetQ1", "icTargetQ2", "icTargetQ3", "icTargetQ4"] as const).map((k, i) => (
                            <div key={k}>
                              <label className={FIELD_LABEL}>Target Q{i + 1}</label>
                              <input value={form[k]} onChange={(e) => set(k, e.target.value)} className={INPUT_CLS} placeholder="0" />
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-4 gap-3">
                          {(["quotaQ1", "quotaQ2", "quotaQ3", "quotaQ4"] as const).map((k, i) => (
                            <div key={k}>
                              <label className={FIELD_LABEL}>Achv. Q{i + 1}</label>
                              <select value={form[k]} onChange={(e) => set(k, e.target.value)} className={INPUT_CLS}>
                                <option value="">Select...</option>
                                {achievementBandOptions.map((o) => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* --- Industries --- */}
              <section>
                <span className={SECTION_LABEL}>Industries</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={FIELD_LABEL}>Current industry</label>
                    <select value={form.currentIndustry} onChange={(e) => set("currentIndustry", e.target.value)} className={INPUT_CLS}>
                      <option value="">Select...</option>
                      {industryOptions.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                    {form.currentIndustry === "Other" && (
                      <input
                        value={form.currentIndustryOther}
                        onChange={(e) => set("currentIndustryOther", e.target.value.slice(0, 60))}
                        maxLength={60}
                        placeholder="e.g. EdTech, Fintech, Insurance"
                        className={`${INPUT_CLS} mt-2`}
                      />
                    )}
                  </div>
                  <div>
                    <label className={FIELD_LABEL}>
                      Previous industries <span className="text-slate-400">(comma-separated)</span>
                    </label>
                    <input
                      value={form.previousIndustries}
                      onChange={(e) => set("previousIndustries", e.target.value)}
                      placeholder="e.g. EdTech, Retail Sales"
                      className={INPUT_CLS}
                    />
                  </div>
                </div>
              </section>
            </div>

            {error && <p className="px-5 text-[12px] text-red-600 mb-2">{error}</p>}

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-900">
              <button
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 px-3 py-1.5"
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
        </div>
      )}
    </>
  );
}
