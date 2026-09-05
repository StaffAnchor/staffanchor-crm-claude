"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Practice = {
  id: string;
  slug: string;
  name: string;
  group_name: "enterprise_sales" | "b2c_sales" | "functional";
};

const GROUP_LABEL: Record<Practice["group_name"], string> = {
  enterprise_sales: "Enterprise Sales & GTM",
  b2c_sales: "B2C Sales & Consumer Sales",
  functional: "Functional Practices",
};

// Extends the older 3-bucket specialties (b2b_sales/b2c_sales/non_sales,
// see specialties-control.tsx) to the full 17-practice list, so an admin can
// make a recruiter the owner of a specific practice's candidate pool (e.g.
// "SaaS Sales" specifically, not just "Enterprise" broadly). Backing table
// is recruiter_practices; the old specialties column is left untouched
// since Employer Inquiries owner-suggestion still reads it.
export default function PracticesControl({
  userId,
  allPractices,
  currentPracticeIds,
}: {
  userId: string;
  allPractices: Practice[];
  currentPracticeIds: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(currentPracticeIds);
  const [saving, setSaving] = useState(false);

  async function toggle(practiceId: string) {
    const next = selected.includes(practiceId)
      ? selected.filter((v) => v !== practiceId)
      : [...selected, practiceId];
    setSelected(next);
    setSaving(true);
    await supabase.rpc("admin_update_recruiter_practices", { p_user_id: userId, p_practice_ids: next });
    setSaving(false);
    router.refresh();
  }

  const grouped = (["enterprise_sales", "b2c_sales", "functional"] as const).map((g) => ({
    group: g,
    practices: allPractices.filter((p) => p.group_name === g),
  }));

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[12px] px-2.5 py-1 rounded-full border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        {selected.length === 0 ? "No practices" : `${selected.length} practice${selected.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-72 max-h-80 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-ros-xl p-3 space-y-3">
          {grouped.map(({ group, practices }) => (
            <div key={group}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">
                {GROUP_LABEL[group]}
              </p>
              <div className="flex flex-wrap gap-1">
                {practices.map((p) => {
                  const active = selected.includes(p.id);
                  return (
                    <button
                      type="button"
                      key={p.id}
                      disabled={saving}
                      onClick={() => toggle(p.id)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                        active
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full text-center text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
