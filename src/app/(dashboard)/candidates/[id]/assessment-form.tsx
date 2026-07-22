"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { noticePeriodOptions } from "@/lib/candidate-options";

const RED_FLAG_OPTIONS = [
  "compensation mismatch",
  "inconsistent story",
  "unclear reason for leaving",
  "frequent job hops",
  "unverifiable claims",
  "poor communication on call",
];

type Assessment = {
  communication_score?: number;
  confidence_score?: number;
  coachability_score?: number;
  job_stability?: string;
  relocation_verified?: string;
  notice_verified?: string;
  compensation_verified?: string;
  overall_recommendation?: string;
  red_flags?: string[];
};

const SELECT_CLS =
  "w-full rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30";
const INPUT_CLS = SELECT_CLS;

function normalize(location: string | null | undefined): string {
  return (location ?? "").trim().toLowerCase();
}

export default function AssessmentForm({
  candidateId,
  assessment,
  candidateLocation,
  linkedMandateCities,
}: {
  candidateId: string;
  assessment: Assessment;
  /** Candidate's own current_location, used to flag when they're already in
      the same city as a linked mandate -- so the recruiter isn't left
      guessing whether "relocation" even applies. */
  candidateLocation?: string | null;
  /** Cities of mandates this candidate is currently linked to, deduped. */
  linkedMandateCities?: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<Assessment>(assessment ?? {});
  const [saving, setSaving] = useState(false);

  const sameCityMandates = (linkedMandateCities ?? []).filter(
    (c) => normalize(c) === normalize(candidateLocation) && normalize(c) !== ""
  );

  function set<K extends keyof Assessment>(key: K, value: Assessment[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleFlag(flag: string) {
    const current = form.red_flags ?? [];
    set(
      "red_flags",
      current.includes(flag) ? current.filter((f) => f !== flag) : [...current, flag]
    );
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from("candidates").update({ recruiter_assessment: form }).eq("id", candidateId);
    setSaving(false);
    router.refresh();
  }

  const scoreField = (label: string, key: "communication_score" | "confidence_score" | "coachability_score") => (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label} (1-5)</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => set(key, n)}
            className={`w-7 h-7 rounded-ros-md text-xs font-medium transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
              form[key] === n
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {scoreField("Communication", "communication_score")}
      {scoreField("Confidence / executive presence", "confidence_score")}
      {scoreField("Attitude / coachability", "coachability_score")}

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Job stability</label>
        <select value={form.job_stability ?? ""} onChange={(e) => set("job_stability", e.target.value)} className={SELECT_CLS}>
          <option value="">Select...</option>
          <option value="Stable">Stable</option>
          <option value="Some Movement">Some Movement</option>
          <option value="Frequent Job-Hopper">Frequent Job-Hopper</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Relocation — verified</label>
        <select value={form.relocation_verified ?? ""} onChange={(e) => set("relocation_verified", e.target.value)} className={SELECT_CLS}>
          <option value="">Select...</option>
          <option value="Same city — relocation not needed">Same city — relocation not needed</option>
          <option value="Willing to relocate">Willing to relocate</option>
          <option value="Not willing to relocate">Not willing to relocate</option>
          <option value="Conditional (specific cities only)">Conditional (specific cities only)</option>
        </select>
        {sameCityMandates.length > 0 && !form.relocation_verified && (
          <p className="text-[11px] text-blue-600 mt-1">
            Candidate is already based in {sameCityMandates[0]}, same as this mandate — relocation likely doesn&apos;t apply.
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notice period — verified</label>
        <select value={form.notice_verified ?? ""} onChange={(e) => set("notice_verified", e.target.value)} className={SELECT_CLS}>
          <option value="">Select...</option>
          {noticePeriodOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
          <option value="Can join early (mid-notice)">Can join early (mid-notice)</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Compensation — verified</label>
        <input
          value={form.compensation_verified ?? ""}
          onChange={(e) => set("compensation_verified", e.target.value)}
          placeholder="e.g. Confirmed, matches self-reported"
          className={INPUT_CLS}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Red flags</label>
        <div className="flex flex-wrap gap-1.5">
          {RED_FLAG_OPTIONS.map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => toggleFlag(flag)}
              className={`text-xs px-2 py-1 rounded-ros-full border transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98] ${
                (form.red_flags ?? []).includes(flag)
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:bg-slate-800/50"
              }`}
            >
              {flag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Overall recommendation</label>
        <select value={form.overall_recommendation ?? ""} onChange={(e) => set("overall_recommendation", e.target.value)} className={SELECT_CLS}>
          <option value="">Select...</option>
          <option value="Strong Fit">Strong Fit</option>
          <option value="Fit with Reservations">Fit with Reservations</option>
          <option value="Not a Fit">Not a Fit</option>
        </select>
      </div>

      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save assessment"}
      </Button>
    </div>
  );
}
