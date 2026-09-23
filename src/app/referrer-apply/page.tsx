"use client";

import { useState } from "react";

// Public application form for StaffAnchor Sales Circle referrers -- mirrors
// /vendor-apply/page.tsx's shape (client component posting FormData to a
// public API route), but for the Sales Circle referrer network rather than
// the freelance-recruiter vendor network. No login exists yet at this
// point, so this route is exempted in middleware.ts alongside vendor-apply.
const SECTOR_OPTIONS = [
  "SaaS / B2B Software",
  "Fintech",
  "Consumer / D2C",
  "Healthtech",
  "Edtech",
  "Enterprise Tech",
  "Manufacturing / Industrial",
  "Logistics / Supply Chain",
  "Real Estate / PropTech",
  "Other",
];

export default function ReferrerApplyPage() {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(e.currentTarget);
    selectedSectors.forEach((s) => form.append("sectors", s));
    try {
      const res = await fetch("/api/referrer-apply", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  function toggleSector(sector: string) {
    setSelectedSectors((prev) => (prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector]));
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md text-center bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h1 className="text-lg font-semibold text-slate-900">Application received</h1>
          <p className="text-sm text-slate-500 mt-2">
            Thanks for applying to StaffAnchor Sales Circle. We review every application personally -- you&apos;ll
            hear from us by email once it&apos;s been reviewed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-900">StaffAnchor Sales Circle</h1>
          <p className="text-sm text-slate-500 mt-2">
            Know a great sales professional looking for their next role? Introduce them, and earn a payout when
            they&apos;re placed. A curated network -- by application only.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}
          <Field label="Full name" name="fullName" required />
          <Field label="Phone" name="phone" type="tel" required />
          <Field label="Email" name="email" type="email" required />
          <Field label="LinkedIn URL" name="linkedinUrl" type="url" required />
          <Field label="Current company" name="currentCompany" required />
          <Field label="Designation" name="designation" required />
          <Field label="Years of experience" name="yearsOfExperience" type="number" step="0.5" required />
          <Field label="City" name="city" required />
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Sectors you know well</label>
            <div className="flex flex-wrap gap-1.5">
              {SECTOR_OPTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSector(s)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${
                    selectedSectors.includes(s)
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600 pt-2">
            <input type="checkbox" name="tosAccepted" value="true" required className="mt-0.5" />
            <span>
              I agree to StaffAnchor Sales Circle&apos;s{" "}
              <a href="/sales-circle-terms" target="_blank" className="underline">
                Terms &amp; Conditions
              </a>
              .
            </span>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 disabled:opacity-50"
          >
            {submitting ? "Submitting..." : "Apply to join"}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  step,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  step?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        step={step}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  );
}
