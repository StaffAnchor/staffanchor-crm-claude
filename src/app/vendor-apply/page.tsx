"use client";

import { useState } from "react";
import {
  Sparkles,
  Users,
  Wallet,
  Clock,
  Briefcase,
  Building2,
  Wrench,
  CalendarClock,
  Languages,
  FileText,
  UploadCloud,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { languageOptions } from "@/lib/candidate-options";

// Public self-serve application for freelance recruiters, live at
// vendors.staffanchor.com (middleware.ts rewrites that host's "/" to this
// route). Submits straight to api/vendor-apply with no session -- deliberately
// outside every (dashboard)/vendor layout, same class of route as
// vendor-signup/[token]/page.tsx. Approving an application (Vendors page,
// admin-only) is what actually creates the vendor_agencies row and emails
// the existing vendor-signup set-password link -- this page only ever
// writes to vendor_applications.

const ROLE_OPTIONS = [
  "SDR / BDR",
  "Account Executive",
  "Enterprise Account Executive",
  "Sales Manager",
  "Regional / Zonal Sales Head",
  "VP Sales / Sales Director",
  "CRO / CXO",
  "Customer Success",
  "Sales Engineer / Solutions Consultant",
  "Channel / Partnerships",
];

const INDUSTRY_OPTIONS = [
  "SaaS / Software",
  "EdTech",
  "BFSI (Fintech / Finance / Loan / Insurance)",
  "Real Estate",
  "Healthcare",
  "D2C / Retail",
  "Manufacturing",
  "Other",
];

const CONNECTIONS_BANDS = ["Under 500", "500 - 1,000", "1,000 - 2,500", "2,500 - 5,000", "5,000+"];
const HOURS_OPTIONS = ["Under 10 hrs/week", "10 - 20 hrs/week", "20 - 30 hrs/week", "30+ hrs/week"];

// Dropdown bands rather than a free-typed number -- easier to fill in on
// mobile, and keeps self-reported experience in consistent buckets instead
// of "3" vs "3.0" vs "three". Values map to a representative number of
// years that still lands in the numeric total_experience_years /
// b2b_sales_hiring_experience_years / enterprise_sales_hiring_experience_years
// columns unchanged -- no API/schema change needed.
const EXPERIENCE_OPTIONS = [
  { label: "<1 year", value: "0.5" },
  { label: "1 year", value: "1" },
  { label: "2 years", value: "2" },
  { label: "3 years", value: "3" },
  { label: "4 years", value: "4" },
  { label: "5 years", value: "5" },
  { label: "6 years", value: "6" },
  { label: "7 years", value: "7" },
  { label: "8 years", value: "8" },
  { label: "9 years", value: "9" },
  { label: "10 years", value: "10" },
  { label: "10+ years", value: "12" },
];

// India-only major-city + state dropdown for "current location" -- covers
// the vast majority of applicants at a glance while still letting anyone
// outside this list fall through to a free-text "Other" field, so no one's
// blocked from applying just because their city isn't in the preset list.
const MAJOR_CITIES = [
  "Mumbai",
  "Delhi NCR",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Kolkata",
  "Pune",
  "Ahmedabad",
  "Jaipur",
  "Chandigarh",
  "Lucknow",
  "Kochi",
  "Indore",
  "Surat",
  "Nagpur",
  "Coimbatore",
  "Gurugram",
  "Noida",
];

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition duration-150 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10";

const chipBaseClass =
  "text-xs font-medium px-3.5 py-1.5 rounded-full border transition-all duration-150";
const chipOnClass = "bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-700 shadow-sm shadow-blue-600/30";
const chipOffClass = "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/60";

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-blue-100">
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-slate-900 tracking-tight">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-500 mb-1.5">{children}</label>;
}

export default function VendorApplyPage() {
  const [rolesHiredFor, setRolesHiredFor] = useState<string[]>([]);
  const [industriesHiredFor, setIndustriesHiredFor] = useState<string[]>([]);
  const [languagesKnown, setLanguagesKnown] = useState<string[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [phoneDigits, setPhoneDigits] = useState("");
  const [locationOption, setLocationOption] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const todayISO = new Date().toISOString().slice(0, 10);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);

    if (phoneDigits.length !== 10) {
      setError("Please enter a valid 10-digit phone number.");
      return;
    }
    const locationValue = locationOption === "Other" ? customLocation.trim() : locationOption;
    if (!locationValue) {
      setError("Please select your current location.");
      return;
    }
    if (!resumeFile) {
      setError("Please attach your resume as a PDF.");
      return;
    }
    if (!(fd.get("consent") === "on")) {
      setError("Please accept the consent checkbox to continue.");
      return;
    }
    fd.set("consent", "true");
    fd.set("resume", resumeFile);
    fd.set("phone", `+91 ${phoneDigits}`);
    fd.set("currentLocation", locationValue);
    rolesHiredFor.forEach((v) => fd.append("rolesHiredFor", v));
    industriesHiredFor.forEach((v) => fd.append("industriesHiredFor", v));
    languagesKnown.forEach((v) => fd.append("languagesKnown", v));

    setSubmitting(true);
    try {
      const res = await fetch("/api/vendor-apply", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#060b18] flex items-center justify-center p-4">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-600/25 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-[100px]" />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8 text-center shadow-2xl animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Application received</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Thanks for applying to the StaffAnchor vendor network. Our team reviews every application by hand --
            if it&apos;s a fit, we&apos;ll email you a link to set up your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen ros-canvas bg-[#f8fafc]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-[#060b18]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-[10%] h-96 w-96 rounded-full bg-blue-600/25 blur-[110px]" />
          <div className="absolute -top-24 right-[5%] h-80 w-80 rounded-full bg-indigo-500/20 blur-[100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] bg-[length:26px_26px]" />
        </div>

        <div className="relative mx-auto max-w-3xl px-4 pt-14 pb-28 sm:px-6">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-300 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
            StaffAnchor Vendor Network
          </div>

          <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-white text-balance">
            Freelance recruiters, expert in B2B sales hiring
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-[15px] leading-relaxed text-slate-300">
            Work mandates from StaffAnchor&apos;s client roster on your own schedule -- submit candidates, get paid
            per placement.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <Wallet className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
              Paid per placement
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <Clock className="h-3.5 w-3.5 text-blue-400" strokeWidth={2.2} />
              Work your own hours
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <Users className="h-3.5 w-3.5 text-indigo-400" strokeWidth={2.2} />
              Real client mandates
            </div>
          </div>
        </div>
      </div>

      {/* Form -- floats up over the hero */}
      <div className="relative mx-auto max-w-3xl px-4 -mt-16 pb-16 sm:px-6">
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white px-4 py-3.5 text-sm text-blue-900 shadow-lg shadow-blue-900/5">
          <Wallet className="h-4.5 w-4.5 shrink-0 mt-0.5 text-blue-600" strokeWidth={2} />
          <p className="leading-relaxed">
            <span className="font-semibold">Payout percentage and payment timeline</span> are shared with you when a
            mandate is allotted -- every mandate can differ, so we&apos;d rather tell you the real number up front
            than quote one here.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04]">
            <SectionHeader icon={Users} title="About you" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <FieldLabel>Full name</FieldLabel>
                <input name="fullName" required placeholder="Jane Doe" className={inputClass} />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input name="email" type="email" required placeholder="jane@example.com" className={inputClass} />
              </div>
              <div>
                <FieldLabel>Phone / WhatsApp number</FieldLabel>
                <div className="flex items-center rounded-xl border border-slate-200 bg-white shadow-sm transition duration-150 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-500/10">
                  <span className="pl-3.5 pr-2.5 py-2.5 text-sm font-medium text-slate-500 border-r border-slate-200 shrink-0">
                    +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    required
                    placeholder="98765 43210"
                    value={phoneDigits}
                    onChange={(e) => setPhoneDigits(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    className="w-full min-w-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Current location</FieldLabel>
                <select
                  required
                  value={locationOption}
                  onChange={(e) => setLocationOption(e.target.value)}
                  className={`${inputClass} appearance-none bg-white`}
                >
                  <option value="">Select city or state</option>
                  <optgroup label="Major cities">
                    {MAJOR_CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </optgroup>
                  <optgroup label="States">
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </optgroup>
                  <option value="Other">Other</option>
                </select>
                {locationOption === "Other" && (
                  <input
                    required
                    placeholder="Enter your city, state"
                    value={customLocation}
                    onChange={(e) => setCustomLocation(e.target.value)}
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>
              <div className="sm:col-span-2">
                <FieldLabel>LinkedIn profile URL</FieldLabel>
                <input name="linkedinUrl" required placeholder="linkedin.com/in/..." className={inputClass} />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04]">
            <SectionHeader icon={Briefcase} title="Recruiting experience" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
              <div>
                <FieldLabel>Total experience</FieldLabel>
                <select name="totalExperienceYears" required defaultValue="" className={`${inputClass} appearance-none bg-white`}>
                  <option value="" disabled>Select</option>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>B2B sales hiring exp</FieldLabel>
                <select name="b2bSalesHiringExperienceYears" required defaultValue="" className={`${inputClass} appearance-none bg-white`}>
                  <option value="" disabled>Select</option>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Enterprise sales hiring exp</FieldLabel>
                <select name="enterpriseSalesHiringExperienceYears" defaultValue="" className={`${inputClass} appearance-none bg-white`}>
                  <option value="">None / not applicable</option>
                  {EXPERIENCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <p className="text-xs font-medium text-slate-500 mb-2.5">Roles you typically hire for</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {ROLE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRolesHiredFor((prev) => toggle(prev, r))}
                  className={`${chipBaseClass} ${rolesHiredFor.includes(r) ? chipOnClass : chipOffClass}`}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              Industries you&apos;ve hired for
            </p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRY_OPTIONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIndustriesHiredFor((prev) => toggle(prev, i))}
                  className={`${chipBaseClass} ${industriesHiredFor.includes(i) ? chipOnClass : chipOffClass}`}
                >
                  {i}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04]">
            <SectionHeader icon={Wrench} title="Tools and access" />
            <div className="space-y-3">
              <div>
                <FieldLabel>LinkedIn connections</FieldLabel>
                <select name="linkedinConnectionsBand" required className={`${inputClass} appearance-none bg-white`}>
                  <option value="">Select a range</option>
                  {CONNECTIONS_BANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
              <YesNoRow name="hasLinkedinRecruiterOrNavigator" label="Access to LinkedIn Recruiter or Sales Navigator?" />
              <YesNoRow name="hasJobPortalAccess" label="Access to job portals (Naukri, Monster, IIMJobs etc)?" />
              <YesNoRow name="interestedInPaidJobPortalAccess" label="Interested in paid job portal access through StaffAnchor?" />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04]">
            <SectionHeader icon={CalendarClock} title="Availability" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              <div>
                <FieldLabel>Expected hours per week with StaffAnchor</FieldLabel>
                <select name="expectedHoursPerWeek" required className={`${inputClass} appearance-none bg-white`}>
                  <option value="">Select</option>
                  {HOURS_OPTIONS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Available to start</FieldLabel>
                <input
                  type="date"
                  name="availableToStart"
                  required
                  min={todayISO}
                  defaultValue={todayISO}
                  className={inputClass}
                />
              </div>
            </div>
            <p className="text-xs font-medium text-slate-500 mb-2.5 flex items-center gap-1.5">
              <Languages className="h-3.5 w-3.5 text-slate-400" />
              Languages known
            </p>
            <div className="flex flex-wrap gap-2">
              {languageOptions.map((l) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLanguagesKnown((prev) => toggle(prev, l))}
                  className={`${chipBaseClass} ${languagesKnown.includes(l) ? chipOnClass : chipOffClass}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04]">
            <SectionHeader icon={FileText} title="Resume" />
            <FieldLabel>Upload your resume (PDF)</FieldLabel>
            <label
              htmlFor="resume-upload"
              className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 text-sm cursor-pointer transition-colors duration-150 ${
                resumeFile
                  ? "border-emerald-300 bg-emerald-50/60 text-emerald-700"
                  : "border-slate-200 bg-slate-50/60 text-slate-500 hover:border-blue-300 hover:bg-blue-50/40"
              }`}
            >
              {resumeFile ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" strokeWidth={2} />
              ) : (
                <UploadCloud className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
              )}
              <span className="truncate font-medium">
                {resumeFile ? resumeFile.name : "Click to upload, PDF only"}
              </span>
              <input
                id="resume-upload"
                type="file"
                accept="application/pdf"
                required
                onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                className="sr-only"
              />
            </label>

            <div className="mt-4">
              <FieldLabel>Anything else we should know (optional)</FieldLabel>
              <textarea name="additionalNotes" rows={3} className={inputClass} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-slate-900/[0.04]">
            <label className="flex items-start gap-3 text-xs text-slate-500 leading-relaxed cursor-pointer">
              <input
                type="checkbox"
                name="consent"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span className="flex items-start gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
                I agree to be contacted by StaffAnchor about vendor opportunities and consent to my information being
                stored for that purpose.
              </span>
            </label>
          </section>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="group w-full rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white text-sm font-semibold py-3.5 shadow-lg shadow-blue-600/25 transition-all duration-150 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
          >
            {submitting ? "Submitting..." : "Submit application"}
          </button>
        </form>
      </div>
    </div>
  );
}

function YesNoRow({ name, label }: { name: string; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50/70 px-3.5 py-2.5">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="flex gap-1 shrink-0">
        <label className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white has-[:checked]:bg-gradient-to-b has-[:checked]:from-blue-600 has-[:checked]:to-blue-700 has-[:checked]:text-white has-[:checked]:border-blue-700 has-[:checked]:shadow-sm cursor-pointer transition-all duration-150">
          <input type="radio" name={name} value="true" required className="sr-only" />
          Yes
        </label>
        <label className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-200 bg-white has-[:checked]:bg-gradient-to-b has-[:checked]:from-blue-600 has-[:checked]:to-blue-700 has-[:checked]:text-white has-[:checked]:border-blue-700 has-[:checked]:shadow-sm cursor-pointer transition-all duration-150">
          <input type="radio" name={name} value="false" className="sr-only" />
          No
        </label>
      </div>
    </div>
  );
}
