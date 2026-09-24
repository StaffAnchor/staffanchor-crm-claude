"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MandateSummary = {
  id: string;
  role_title: string;
  category: string | null;
  budget_min: number | null;
  budget_max: number | null;
  experience_min: number | null;
  experience_max: number | null;
};

const SALES_EXPERIENCE_OPTIONS = [
  { value: "b2b_sales", label: "B2B sales" },
  { value: "b2c_sales", label: "B2C sales" },
  { value: "both", label: "Both B2B and B2C" },
  { value: "neither", label: "Neither / not a sales background" },
];

function formatLakhs(n: number | null): string {
  if (n == null) return "—";
  return `₹${(n / 100000).toFixed(1)}L`;
}

function categoryLabel(category: string | null): string {
  if (category === "b2b_sales") return "B2B sales";
  if (category === "b2c_sales") return "B2C sales";
  if (category === "non_sales") return "Non-sales";
  return "—";
}

// Fit hints are advisory only -- referrers can still submit regardless, since
// the recruiter does the real screening. This just helps them self-check
// before submitting rather than surprising them with a rejection later.
function fitHints(mandate: MandateSummary | null, salesExperience: string, experienceYears: string, expectedCtc: string) {
  if (!mandate) return [];
  const hints: { ok: boolean; text: string }[] = [];

  if (salesExperience && (mandate.category === "b2b_sales" || mandate.category === "b2c_sales")) {
    const matches =
      salesExperience === "both" ||
      (mandate.category === "b2b_sales" && salesExperience === "b2b_sales") ||
      (mandate.category === "b2c_sales" && salesExperience === "b2c_sales");
    hints.push({
      ok: matches,
      text: matches
        ? `Matches the ${categoryLabel(mandate.category)} background this role needs.`
        : `This role is ${categoryLabel(mandate.category)} -- the candidate's declared experience doesn't match.`,
    });
  }

  const years = Number(experienceYears);
  if (experienceYears && !Number.isNaN(years) && (mandate.experience_min != null || mandate.experience_max != null)) {
    const min = mandate.experience_min ?? 0;
    const max = mandate.experience_max ?? Infinity;
    const inBand = years >= min && years <= max;
    hints.push({
      ok: inBand,
      text: inBand
        ? `${years} yrs experience is within the role's ${min}–${mandate.experience_max ?? "+"} yr band.`
        : `Role expects roughly ${min}–${mandate.experience_max ?? "+"} yrs; candidate has ${years}.`,
    });
  }

  const ctc = Number(expectedCtc);
  if (expectedCtc && !Number.isNaN(ctc) && (mandate.budget_min != null || mandate.budget_max != null)) {
    const min = mandate.budget_min ?? 0;
    const max = mandate.budget_max ?? Infinity;
    const inBand = ctc >= min * 0.85 && ctc <= max * 1.1;
    hints.push({
      ok: inBand,
      text: inBand
        ? `Expected CTC ${formatLakhs(ctc)} is close to the role's ${formatLakhs(mandate.budget_min)}–${formatLakhs(mandate.budget_max)} band.`
        : `Role budget is ${formatLakhs(mandate.budget_min)}–${formatLakhs(mandate.budget_max)}; expected CTC ${formatLakhs(ctc)} is outside that.`,
    });
  }

  return hints;
}

function ReferForm() {
  const params = useSearchParams();
  const router = useRouter();
  const mandateId = params.get("mandate");
  const [mandate, setMandate] = useState<MandateSummary | null>(null);
  const [form, setForm] = useState({
    candidateName: "",
    candidatePhone: "",
    candidateEmail: "",
    candidateLinkedinUrl: "",
    candidateCurrentCompany: "",
    candidateCurrentDesignation: "",
    whyFit: "",
    salesExperience: "",
    experienceYears: "",
    expectedCtc: "",
    noticePeriod: "",
  });
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!mandateId) return;
    const supabase = createClient();
    supabase
      .from("mandates")
      .select("id, role_title, category, budget_min, budget_max, experience_min, experience_max")
      .eq("id", mandateId)
      .single()
      .then(({ data }) => setMandate(data as MandateSummary | null));
  }, [mandateId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    if (mandateId) body.append("mandateId", mandateId);
    body.append("consentConfirmed", String(consent));
    if (resumeFile) body.append("resume", resumeFile);

    const res = await fetch("/api/referrer/referrals", { method: "POST", body });
    const json = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(json.error ?? "Something went wrong. Please try again.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/referrer/my-referrals"), 1800);
  }

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  if (done) {
    return (
      <div className="max-w-lg mx-auto px-5 py-16 text-center">
        <h1 className="text-lg font-semibold text-slate-900">Referral submitted</h1>
        <p className="text-sm text-slate-500 mt-2">We&apos;ll take it from here. Taking you to My Referrals...</p>
      </div>
    );
  }

  const hints = fitHints(mandate, form.salesExperience, form.experienceYears, form.expectedCtc);

  return (
    <div className="max-w-lg mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Refer someone</h1>
      <p className="text-sm text-slate-500 mt-1">
        {mandateId
          ? mandate
            ? `Submitting for ${mandate.role_title}.`
            : "Submitting for the role you selected."
          : "No specific role in mind? Submit them to our bench -- we'll match them to roles as they open up."}
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 mt-6">
        {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}

        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide pt-1">Candidate details</div>
        <Field label="Candidate name" value={form.candidateName} onChange={(v) => set("candidateName", v)} required />
        <Field label="Phone" value={form.candidatePhone} onChange={(v) => set("candidatePhone", v)} type="tel" />
        <Field label="Email" value={form.candidateEmail} onChange={(v) => set("candidateEmail", v)} type="email" />
        <Field
          label="LinkedIn URL"
          value={form.candidateLinkedinUrl}
          onChange={(v) => set("candidateLinkedinUrl", v)}
          type="url"
        />
        <Field
          label="Current company"
          value={form.candidateCurrentCompany}
          onChange={(v) => set("candidateCurrentCompany", v)}
        />
        <Field
          label="Current designation"
          value={form.candidateCurrentDesignation}
          onChange={(v) => set("candidateCurrentDesignation", v)}
        />

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Resume (PDF, optional but recommended)</label>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
          />
        </div>

        <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide pt-2">Fit questionnaire</div>
        <p className="text-[12px] text-slate-400 -mt-2">
          Same standardized questions for every role -- helps the recruiter triage faster.
        </p>

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Sales experience</label>
          <select
            value={form.salesExperience}
            onChange={(e) => set("salesExperience", e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          >
            <option value="">Select...</option>
            {SALES_EXPERIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Total experience (yrs)"
            value={form.experienceYears}
            onChange={(v) => set("experienceYears", v)}
            type="number"
          />
          <Field
            label="Expected CTC (₹, annual)"
            value={form.expectedCtc}
            onChange={(v) => set("expectedCtc", v)}
            type="number"
          />
        </div>
        <Field label="Notice period" value={form.noticePeriod} onChange={(v) => set("noticePeriod", v)} placeholder="e.g. 30 days, immediate" />

        {hints.length > 0 && (
          <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-1.5">
            {hints.map((h, i) => (
              <div key={i} className={`text-[12px] flex items-start gap-1.5 ${h.ok ? "text-emerald-700" : "text-amber-700"}`}>
                <span>{h.ok ? "✓" : "⚠"}</span>
                <span>{h.text}</span>
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Why they&apos;re a fit</label>
          <textarea
            value={form.whyFit}
            onChange={(e) => set("whyFit", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
          />
        </div>
        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5"
          />
          <span>The candidate knows I am recommending them and agrees to be contacted.</span>
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium py-2.5 disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit referral"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
      />
    </div>
  );
}

export default function ReferPage() {
  return (
    <Suspense fallback={null}>
      <ReferForm />
    </Suspense>
  );
}
