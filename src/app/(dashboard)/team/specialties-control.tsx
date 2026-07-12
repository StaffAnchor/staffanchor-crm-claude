"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SPECIALTY_OPTIONS: { value: string; label: string }[] = [
  { value: "b2b_sales", label: "B2B" },
  { value: "b2c_sales", label: "B2C" },
  { value: "non_sales", label: "Non-Sales" },
];

// Lets an admin tag each team member with which mandate categories they
// specialize in (multiple allowed -- e.g. someone can be both a B2B and
// Non-Sales specialist). Read by the Employer Inquiries owner-assignment
// dropdown to suggest matching specialists first for a given inquiry.
export default function SpecialtiesControl({
  userId,
  currentSpecialties,
}: {
  userId: string;
  currentSpecialties: string[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>(currentSpecialties);
  const [saving, setSaving] = useState(false);

  async function toggle(value: string) {
    const next = selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value];
    setSelected(next);
    setSaving(true);
    await supabase.rpc("admin_update_specialties", { p_user_id: userId, p_specialties: next });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SPECIALTY_OPTIONS.map((o) => (
        <label
          key={o.value}
          className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] cursor-pointer transition-colors ${
            selected.includes(o.value)
              ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400"
          } ${saving ? "opacity-60" : ""}`}
        >
          <input
            type="checkbox"
            checked={selected.includes(o.value)}
            onChange={() => toggle(o.value)}
            disabled={saving}
            className="hidden"
          />
          {o.label}
        </label>
      ))}
    </div>
  );
}
