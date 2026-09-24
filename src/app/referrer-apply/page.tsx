"use client";

import { useState } from "react";
import {
  Sparkles,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Users2,
  Send,
  Trophy,
  Lock,
  Eye,
  Zap,
  Clock3,
  BadgeCheck,
} from "lucide-react";

// Public marketing + application page for StaffAnchor Sales Circle referrers
// -- mirrors /vendor-apply/page.tsx's premium dark-hero + floating-form
// visual language (same install: lucide-react, no new deps), but the copy
// here is built to sell the *opportunity* (earn from your network, zero
// recruiting work) rather than just collect fields. No login exists at this
// point, so this route stays exempt in middleware.ts alongside vendor-apply.
// Submits straight to api/referrer-apply -- approving an application (Sales
// Circle admin panel) is what actually sends the set-password signup link.
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

// Illustrative only -- the real, currently-active slab table lives in
// sales_circle_payout_slabs and is admin-editable, so this static copy is
// intentionally hedged ("up to", "confirmed when you refer") rather than
// treated as a binding quote. Matches the 4 slabs seeded in the referral
// portal migration.
const PAYOUT_BANDS = [
  { band: "Up to ₹6L CTC", payout: "₹15,000" },
  { band: "₹6L – ₹12L CTC", payout: "₹30,000" },
  { band: "₹12L – ₹20L CTC", payout: "₹50,000" },
  { band: "₹20L+ CTC", payout: "₹75,000" },
];

const HOW_IT_WORKS = [
  {
    icon: Send,
    title: "Apply & get approved",
    body: "A short form, reviewed by our team personally. No mass onboarding -- Sales Circle stays a curated, trusted network.",
  },
  {
    icon: Users2,
    title: "Refer people you vouch for",
    body: "Browse live client roles (company names revealed to Trusted-tier referrers), or refer someone great even without a specific role in mind.",
  },
  {
    icon: Wallet,
    title: "Get paid when they join & stay",
    body: "Once your referral joins and completes 90 days, your payout is processed against a transparent CTC-band slab -- no negotiation, no chasing.",
  },
];

const VALUE_PROPS = [
  {
    icon: Zap,
    title: "Zero recruiting work",
    body: "No sourcing, no screening calls, no selling the role. You already know the person -- that's the entire job.",
  },
  {
    icon: Eye,
    title: "Full visibility, always",
    body: "Track every referral's stage in real time -- submitted, interviewing, offered, joined -- from your own dashboard.",
  },
  {
    icon: Clock3,
    title: "Fast, transparent payouts",
    body: "Payout amount is fixed by CTC band before you refer -- you'll always know what you're earning and why.",
  },
  {
    icon: Lock,
    title: "Your data, protected",
    body: "PAN and bank details are only ever collected when a payout is actually due, and can be deleted on request.",
  },
];

const FAQ = [
  {
    q: "Do I need to be a recruiter?",
    a: "No. Sales Circle is built for people with a strong professional network -- sales leaders, founders, operators -- not agency recruiters. If you know great sales talent, that's enough.",
  },
  {
    q: "How much can I earn?",
    a: "Payouts are set per CTC band (see the table above) and capped at 30% of the placement fee StaffAnchor actually receives from the client. The exact number is confirmed the moment you submit a referral.",
  },
  {
    q: "When do I actually get paid?",
    a: "After your referral has joined and completed 90 days, and StaffAnchor has been paid by the client -- whichever comes later. You'll see the payout move from Pending to Eligible to Paid in your dashboard.",
  },
  {
    q: "What's the difference between Member and Trusted tier?",
    a: "Every approved referrer starts as a Member. Trusted-tier referrers (earned through consistent, quality referrals) get to see the client company name on roles before referring -- Members see a blind brief until they submit.",
  },
  {
    q: "What if I don't have a specific role in mind?",
    a: "You can still refer someone great against our general bench -- our team will match them to the right open mandate.",
  },
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
      <div className="relative min-h-screen overflow-hidden bg-[#060b18] flex items-center justify-center p-4">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-600/25 blur-[100px]" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-[100px]" />
        </div>
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.06] backdrop-blur-xl p-8 text-center shadow-2xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-lg shadow-emerald-500/30">
            <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={2.2} />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Application received</h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Thanks for applying to StaffAnchor Sales Circle. We review every application personally -- you&apos;ll
            hear from us by email once it&apos;s been reviewed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      {/* Hero */}
      <div className="relative overflow-hidden bg-[#060b18]">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-[10%] h-96 w-96 rounded-full bg-blue-600/25 blur-[110px]" />
          <div className="absolute -top-24 right-[5%] h-80 w-80 rounded-full bg-indigo-500/20 blur-[100px]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgb(255_255_255/0.06)_1px,transparent_0)] bg-[length:26px_26px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-4 pt-16 pb-32 sm:px-6 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-300 backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.5} />
            StaffAnchor Sales Circle -- by application only
          </div>

          <h1 className="mt-5 text-3xl sm:text-5xl font-semibold tracking-tight text-white text-balance">
            Your network is worth more than a LinkedIn post
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed text-slate-300">
            Know a great sales professional looking for their next move? Introduce them to StaffAnchor and earn a
            real payout the day they join -- no recruiting, no cold outreach, no selling the role.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <Wallet className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
              Up to ₹75,000 per placement
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <Zap className="h-3.5 w-3.5 text-blue-400" strokeWidth={2.2} />
              Zero recruiting work
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm">
              <BadgeCheck className="h-3.5 w-3.5 text-indigo-400" strokeWidth={2.2} />
              Curated, trusted network
            </div>
          </div>

          <a
            href="#apply"
            className="mt-10 inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white text-sm font-semibold px-7 py-3.5 shadow-lg shadow-blue-600/25 transition-all duration-150 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5"
          >
            Apply to join
            <Send className="h-4 w-4" strokeWidth={2.2} />
          </a>
        </div>
      </div>

      {/* How it works */}
      <div className="relative mx-auto max-w-5xl px-4 -mt-20 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.title}
              className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.06]"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-blue-100">
                  <step.icon className="h-4.5 w-4.5" strokeWidth={2} />
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Step {i + 1}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">{step.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">{step.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Value props */}
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Why referrers stick around</h2>
          <p className="mt-2 text-sm text-slate-500 max-w-xl mx-auto">
            This isn&apos;t a referral bonus buried in fine print -- it&apos;s a real, transparent side income built
            around the network you already have.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VALUE_PROPS.map((v) => (
            <div key={v.title} className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-blue-100">
                <v.icon className="h-5 w-5" strokeWidth={2} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{v.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{v.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Payout table */}
      <div className="bg-[#060b18] py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              <Trophy className="h-3.5 w-3.5" strokeWidth={2.5} />
              Transparent payouts
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white">What a placement is worth</h2>
            <p className="mt-2 text-sm text-slate-400 max-w-lg mx-auto">
              Illustrative slabs by the candidate&apos;s CTC -- the exact, currently-active payout is confirmed the
              moment you submit a referral.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-sm overflow-hidden">
            {PAYOUT_BANDS.map((b, i) => (
              <div
                key={b.band}
                className={`flex items-center justify-between px-6 py-4 text-sm ${
                  i !== PAYOUT_BANDS.length - 1 ? "border-b border-white/10" : ""
                }`}
              >
                <span className="text-slate-300">{b.band}</span>
                <span className="font-semibold text-white">{b.payout}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-500">
            Payout = the applicable slab, capped at 30% of the placement fee StaffAnchor receives -- paid after your
            referral joins, completes 90 days, and the client has paid StaffAnchor.
          </p>
        </div>
      </div>

      {/* FAQ */}
      <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 text-center mb-8">
          Questions, answered
        </h2>
        <div className="space-y-2.5">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="group rounded-xl border border-slate-200 bg-white px-4 py-3.5 open:shadow-md open:shadow-slate-900/[0.04] transition-shadow"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-900">
                {item.q}
                <span className="ml-3 shrink-0 text-slate-400 transition-transform duration-150 group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500">{item.a}</p>
            </details>
          ))}
        </div>
      </div>

      {/* Form */}
      <div id="apply" className="relative mx-auto max-w-lg px-4 pb-20 sm:px-6 scroll-mt-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Apply to join Sales Circle</h2>
          <p className="mt-2 text-sm text-slate-500">
            Takes about two minutes. Every application is reviewed by our team personally.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/[0.04] space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-600">
              {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Field label="Full name" name="fullName" required />
            </div>
            <Field label="Phone" name="phone" type="tel" required />
            <Field label="Email" name="email" type="email" required />
            <div className="sm:col-span-2">
              <Field label="LinkedIn URL" name="linkedinUrl" type="url" required />
            </div>
            <Field label="Current company" name="currentCompany" required />
            <Field label="Designation" name="designation" required />
            <Field label="Years of experience" name="yearsOfExperience" type="number" step="0.5" required />
            <Field label="City" name="city" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Sectors you know well</label>
            <div className="flex flex-wrap gap-2">
              {SECTOR_OPTIONS.map((s) => (
                <button
                  type="button"
                  key={s}
                  onClick={() => toggleSector(s)}
                  className={`text-xs font-medium px-3.5 py-1.5 rounded-full border transition-all duration-150 ${
                    selectedSectors.includes(s)
                      ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white border-blue-700 shadow-sm shadow-blue-600/30"
                      : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50/60"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-start gap-2.5 text-xs text-slate-500 leading-relaxed pt-1 cursor-pointer">
            <input type="checkbox" name="tosAccepted" value="true" required className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
            <span className="flex items-start gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
              I agree to StaffAnchor Sales Circle&apos;s{" "}
              <a href="/sales-circle-terms" target="_blank" className="underline hover:text-blue-600">
                Terms &amp; Conditions
              </a>
              .
            </span>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="group w-full rounded-xl bg-gradient-to-b from-blue-600 to-blue-700 text-white text-sm font-semibold py-3.5 shadow-lg shadow-blue-600/25 transition-all duration-150 hover:shadow-xl hover:shadow-blue-600/30 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-lg"
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
      <label className="block text-xs font-medium text-slate-500 mb-1.5">{label}</label>
      <input
        name={name}
        type={type}
        required={required}
        step={step}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition duration-150 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-500/10"
      />
    </div>
  );
}
