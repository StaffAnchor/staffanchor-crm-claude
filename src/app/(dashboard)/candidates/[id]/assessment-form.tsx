"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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

export default function AssessmentForm({
  candidateId,
  assessment,
}: {
  candidateId: string;
  assessment: Assessment;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<Assessment>(assessment ?? {});
  const [saving, setSaving] = useState(false);

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
      <label className="block text-xs font-medium text-slate-600 mb-1">{label} (1-5)</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => set(key, n)}
            className={`w-7 h-7 rounded text-xs font-medium ${
              form[key] === n ? "bg-blue-600 text-white" : "bg-white border border-slate-300 text-slate-600"
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
        <label className="block text-xs font-medium text-slate-600 mb-1">Job stability</label>
        <select
          value={form.job_stability ?? ""}
          onChange={(e) => set("job_stability", e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select...</option>
          <option value="Stable">Stable</option>
          <option value="Some Movement">Some Movement</option>
          <option value="Frequent Job-Hopper">Frequent Job-Hopper</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Relocation — verified</label>
        <select
          value={form.relocation_verified ?? ""}
          onChange={(e) => set("relocation_verified", e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select...</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
          <option value="Conditional">Conditional</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notice period — verified</label>
        <input
          value={form.notice_verified ?? ""}
          onChange={(e) => set("notice_verified", e.target.value)}
          placeholder="e.g. Confirmed 30 days"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Compensation — verified</label>
        <input
          value={form.compensation_verified ?? ""}
          onChange={(e) => set("compensation_verified", e.target.value)}
          placeholder="e.g. Confirmed, matches self-reported"
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Red flags</label>
        <div className="flex flex-wrap gap-1.5">
          {RED_FLAG_OPTIONS.map((flag) => (
            <button
              key={flag}
              type="button"
              onClick={() => toggleFlag(flag)}
              className={`text-xs px-2 py-1 rounded-full border ${
                (form.red_flags ?? []).includes(flag)
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {flag}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Overall recommendation</label>
        <select
          value={form.overall_recommendation ?? ""}
          onChange={(e) => set("overall_recommendation", e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          <option value="">Select...</option>
          <option value="Strong Fit">Strong Fit</option>
          <option value="Fit with Reservations">Fit with Reservations</option>
          <option value="Not a Fit">Not a Fit</option>
        </select>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium py-2 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save assessment"}
      </button>
    </div>
  );
}
