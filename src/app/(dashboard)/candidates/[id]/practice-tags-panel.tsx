"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export type Practice = {
  id: string;
  slug: string;
  name: string;
  group_name: "enterprise_sales" | "b2c_sales" | "functional";
};

export type CandidatePracticeRow = {
  practice_id: string;
  seniority_band: string;
  is_primary: boolean;
};

const SENIORITY_BANDS: { value: string; label: string }[] = [
  { value: "ic", label: "IC / Individual Contributor" },
  { value: "team_lead", label: "Team Lead" },
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "vp_plus", label: "VP & above" },
];

const GROUP_LABEL: Record<Practice["group_name"], string> = {
  enterprise_sales: "Enterprise Sales & GTM",
  b2c_sales: "B2C Sales & Consumer Sales",
  functional: "Functional Practices",
};

// Replaces the old single category/sub_domain dropdown with multi-practice
// tagging: a candidate can belong to more than one practice (e.g. SaaS
// Sales + BFSI, if they've genuinely worked both an Enterprise and a B2C
// desk), each with its own independent seniority band -- a candidate can be
// Director-level in one practice and Manager-level in another. This is the
// pool a recruiter's "My Practice Pool" view and mandate-practice matching
// both read from (see admin_update_candidate_practices RPC).
export default function PracticeTagsPanel({
  candidateId,
  allPractices,
  initial,
}: {
  candidateId: string;
  allPractices: Practice[];
  initial: CandidatePracticeRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [rows, setRows] = useState<CandidatePracticeRow[]>(initial ?? []);
  const [saving, setSaving] = useState(false);

  const grouped = (["enterprise_sales", "b2c_sales", "functional"] as const).map((g) => ({
    group: g,
    practices: allPractices.filter((p) => p.group_name === g),
  }));

  function isSelected(practiceId: string) {
    return rows.some((r) => r.practice_id === practiceId);
  }
  function bandFor(practiceId: string) {
    return rows.find((r) => r.practice_id === practiceId)?.seniority_band ?? "";
  }

  function toggle(practiceId: string) {
    setRows((prev) => {
      if (prev.some((r) => r.practice_id === practiceId)) {
        return prev.filter((r) => r.practice_id !== practiceId);
      }
      return [
        ...prev,
        {
          practice_id: practiceId,
          seniority_band: "manager",
          is_primary: prev.length === 0,
        },
      ];
    });
  }

  function setBand(practiceId: string, band: string) {
    setRows((prev) => prev.map((r) => (r.practice_id === practiceId ? { ...r, seniority_band: band } : r)));
  }

  function setPrimary(practiceId: string) {
    setRows((prev) => prev.map((r) => ({ ...r, is_primary: r.practice_id === practiceId })));
  }

  async function handleSave() {
    setSaving(true);
    await supabase.rpc("admin_update_candidate_practices", {
      p_candidate_id: candidateId,
      p_practices: rows,
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {grouped.map(({ group, practices }) => (
        <div key={group}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
            {GROUP_LABEL[group]}
          </p>
          <div className="space-y-1.5">
            {practices.map((p) => {
              const active = isSelected(p.id);
              return (
                <div key={p.id} className={`rounded-ros-md border px-2.5 py-1.5 ${active ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" : "border-slate-200 dark:border-slate-700"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`text-[12.5px] text-left flex-1 ${active ? "text-blue-700 dark:text-blue-300 font-medium" : "text-slate-600 dark:text-slate-400"}`}
                    >
                      {p.name}
                    </button>
                    {active && (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={bandFor(p.id)}
                          onChange={(e) => setBand(p.id, e.target.value)}
                          className="rounded-md border border-slate-300 dark:border-slate-700 bg-transparent text-[11px] px-1.5 py-1"
                        >
                          {SENIORITY_BANDS.map((b) => (
                            <option key={b.value} value={b.value}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setPrimary(p.id)}
                          title="Set as primary practice"
                          className={`text-[10px] px-1.5 py-1 rounded-md border ${
                            rows.find((r) => r.practice_id === p.id)?.is_primary
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-slate-300 dark:border-slate-700 text-slate-400"
                          }`}
                        >
                          Primary
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save practices"}
      </Button>
    </div>
  );
}
