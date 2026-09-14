"use client";

import { useState } from "react";
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
const START_OPTIONS = ["Immediately", "Within 1 week", "Within 2 weeks", "Flexible"];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function VendorApplyPage() {
  const [rolesHiredFor, setRolesHiredFor] = useState<string[]>([]);
  const [industriesHiredFor, setIndustriesHiredFor] = useState<string[]>([]);
  const [languagesKnown, setLanguagesKnown] = useState<string[]>([]);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const fd = new FormData(form);
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
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Application received</h1>
          <p className="text-sm text-slate-600">
            Thanks for applying to the StaffAnchor vendor network. Our team reviews every application by hand --
            if it&apos;s a fit, we&apos;ll email you a link to set up your account.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-1">StaffAnchor vendor network</p>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Freelance recruiters, expert in B2B sales hiring
          </h1>
          <p className="text-sm text-slate-600">
            Work mandates from StaffAnchor&apos;s client roster on your own schedule -- submit candidates, get paid per
            placement.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 mb-6 text-sm text-blue-800">
          Payout percentage and payment timeline are shared with you when a mandate is allotted -- every mandate can
          differ, so we&apos;d rather tell you the real number up front than quote one here.
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">About you</h2>
            <div className="grid grid-cols-2 gap-3">
              <input name="fullName" required placeholder="Full name" className="col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="email" type="email" required placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="phone" required placeholder="Phone / WhatsApp number" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="currentLocation" required placeholder="Current location (city, state)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <input name="linkedinUrl" required placeholder="LinkedIn profile URL" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Recruiting experience</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <label className="text-xs text-slate-500">
                Total experience (yrs)
                <input name="totalExperienceYears" type="number" min={0} step={0.5} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                B2B sales hiring exp (yrs)
                <input name="b2bSalesHiringExperienceYears" type="number" min={0} step={0.5} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-slate-500">
                Enterprise sales hiring exp (yrs)
                <input name="enterpriseSalesHiringExperienceYears" type="number" min={0} step={0.5} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <p className="text-xs text-slate-500 mb-2">Roles you typically hire for</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {ROLE_OPTIONS.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRolesHiredFor((prev) => toggle(prev, r))}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    rolesHiredFor.includes(r) ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate-500 mb-2">Industries you&apos;ve hired for</p>
            <div className="flex flex-wrap gap-2">
              {INDUSTRY_OPTIONS.map((i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => setIndustriesHiredFor((prev) => toggle(prev, i))}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    industriesHiredFor.includes(i) ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Tools and access</h2>
            <div className="space-y-3">
              <label className="block text-xs text-slate-500">
                LinkedIn connections
                <select name="linkedinConnectionsBand" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">Select a range</option>
                  {CONNECTIONS_BANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </label>
              <YesNoRow name="hasLinkedinRecruiterOrNavigator" label="Access to LinkedIn Recruiter or Sales Navigator?" />
              <YesNoRow name="hasJobPortalAccess" label="Access to job portals (Naukri, Monster, IIMJobs etc)?" />
              <YesNoRow name="interestedInPaidJobPortalAccess" label="Interested in paid job portal access through StaffAnchor?" />
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Availability</h2>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-xs text-slate-500">
                Expected hours per week with StaffAnchor
                <select name="expectedHoursPerWeek" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">Select</option>
                  {HOURS_OPTIONS.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Available to start
                <select name="availableToStart" required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white">
                  <option value="">Select</option>
                  {START_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-slate-500 mb-2">Languages known</p>
            <div className="flex flex-wrap gap-2">
              {languageOptions.map((l) => (
                <button
                  type="button"
                  key={l}
                  onClick={() => setLanguagesKnown((prev) => toggle(prev, l))}
                  className={`text-xs px-3 py-1.5 rounded-full border ${
                    languagesKnown.includes(l) ? "bg-blue-600 text-white border-blue-600" : "border-slate-300 text-slate-600"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Resume</h2>
            <label className="block text-xs text-slate-500 mb-1">Upload your resume (PDF)</label>
            <input
              type="file"
              accept="application/pdf"
              required
              onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-slate-600 mb-4"
            />
            <label className="block text-xs text-slate-500 mb-1">Anything else we should know (optional)</label>
            <textarea name="additionalNotes" rows={3} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </section>

          <label className="flex items-start gap-2 text-xs text-slate-500">
            <input type="checkbox" name="consent" className="mt-0.5" />
            I agree to be contacted by StaffAnchor about vendor opportunities and consent to my information being
            stored for that purpose.
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2.5 disabled:opacity-60"
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
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-slate-600">{label}</span>
      <div className="flex gap-1 shrink-0">
        <label className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 has-[:checked]:bg-blue-600 has-[:checked]:text-white has-[:checked]:border-blue-600 cursor-pointer">
          <input type="radio" name={name} value="true" required className="sr-only" />
          Yes
        </label>
        <label className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 has-[:checked]:bg-blue-600 has-[:checked]:text-white has-[:checked]:border-blue-600 cursor-pointer">
          <input type="radio" name={name} value="false" className="sr-only" />
          No
        </label>
      </div>
    </div>
  );
}
