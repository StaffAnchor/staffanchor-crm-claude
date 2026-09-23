"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

function ReferForm() {
  const params = useSearchParams();
  const router = useRouter();
  const mandateId = params.get("mandate");
  const [form, setForm] = useState({
    candidateName: "",
    candidatePhone: "",
    candidateEmail: "",
    candidateLinkedinUrl: "",
    candidateCurrentCompany: "",
    candidateCurrentDesignation: "",
    whyFit: "",
  });
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/referrer/referrals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, mandateId, consentConfirmed: consent }),
    });
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

  return (
    <div className="max-w-lg mx-auto px-5 py-8">
      <h1 className="text-xl font-semibold text-slate-900">Refer someone</h1>
      <p className="text-sm text-slate-500 mt-1">
        {mandateId
          ? "Submitting for the role you selected."
          : "No specific role in mind? Submit them to our bench -- we'll match them to roles as they open up."}
      </p>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4 mt-6">
        {error && <div className="rounded-lg bg-rose-50 text-rose-700 text-sm px-3 py-2">{error}</div>}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
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
