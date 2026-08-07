"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type VettingScore = {
  technical_depth?: number;
  stability?: number;
  culture_fit?: number;
  communication?: number;
  leadership?: number;
  overall?: number;
  notes?: string;
  scored_by_name?: string;
  scored_at?: string;
};

const CRITERIA: { key: keyof VettingScore; label: string }[] = [
  { key: "technical_depth", label: "Technical / domain depth" },
  { key: "stability", label: "Career stability" },
  { key: "culture_fit", label: "Culture fit" },
  { key: "communication", label: "Communication" },
  { key: "leadership", label: "Leadership / seniority signal" },
];

const SELECT_CLS =
  "w-full rounded-ros-md border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-sm transition-colors duration-200 ease-ros focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-transparent";

// The recruiter's own documented, structured judgment call -- deliberately
// separate from the AI-generated fields (stability_score, ai_decision_flags,
// talent_micro_index). Those are model outputs; this is the compounding
// vetting asset the business plan is actually built on, so it needs its own
// structured home instead of living inside a free-text note where it can't
// be compared across candidates or fed into anything downstream later
// (e.g. correlating scores against real retention outcomes).
export default function VettingScorePanel({
  candidateId,
  initial,
  scorerName,
}: {
  candidateId: string;
  initial: VettingScore;
  scorerName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [form, setForm] = useState<VettingScore>(initial ?? {});
  const [saving, setSaving] = useState(false);

  function set(key: keyof VettingScore, value: number) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const filled = CRITERIA.map((c) => form[c.key]).filter((v): v is number => typeof v === "number");
  const liveOverall = filled.length > 0 ? Math.round((filled.reduce((a, b) => a + b, 0) / filled.length) * 10) : null;

  async function handleSave() {
    setSaving(true);
    const payload: VettingScore = {
      ...form,
      overall: liveOverall ?? undefined,
      scored_by_name: scorerName,
      scored_at: new Date().toISOString(),
    };
    await supabase
      .from("candidates")
      .update({ vetting_score: payload, vetting_score_overall: liveOverall })
      .eq("id", candidateId);
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {CRITERIA.map((c) => (
        <div key={c.key}>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{c.label} (0-10)</label>
          <select
            value={form[c.key] ?? ""}
            onChange={(e) => set(c.key, Number(e.target.value))}
            className={SELECT_CLS}
          >
            <option value="">Not scored</option>
            {Array.from({ length: 11 }, (_, n) => n).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      ))}
      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notes</label>
        <textarea
          value={form.notes ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          rows={2}
          placeholder="What backs up this score -- specific evidence from the call/resume."
          className={SELECT_CLS}
        />
      </div>
      {liveOverall !== null && (
        <div className="flex items-center justify-between rounded-lg bg-teal-50 dark:bg-teal-950/30 px-3 py-2">
          <span className="text-[12px] text-teal-700 dark:text-teal-300 font-medium">Overall vetting score</span>
          <span className="text-lg font-bold text-teal-800 dark:text-teal-200 tabular-nums">{liveOverall}/100</span>
        </div>
      )}
      {form.scored_by_name && form.scored_at && (
        <p className="text-[11px] text-slate-400">
          Last scored by {form.scored_by_name} on {new Date(form.scored_at).toLocaleDateString()}
        </p>
      )}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save vetting score"}
      </Button>
    </div>
  );
}
