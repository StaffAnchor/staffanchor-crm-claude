"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Check } from "lucide-react";

type Profile = { id: string; full_name: string | null; email: string };

// Internal-only "who owns this mandate" control -- never shown on any
// client- or candidate-facing surface (jobs.staffanchor.com, client
// portal, client shortlist link). Lets anyone correct a mis-assigned
// recruiter after the fact, since the create form only lets you pick one
// recruiter once, up front.
export default function MandateOwnerControl({
  mandateId,
  ownerId,
  profiles,
}: {
  mandateId: string;
  ownerId: string | null;
  profiles: Profile[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState(ownerId ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleChange(next: string) {
    setValue(next);
    setSaving(true);
    setSaved(false);
    const { error } = await supabase.from("mandates").update({ owner_id: next || null }).eq("id", mandateId);
    setSaving(false);
    if (!error) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 1500);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-slate-400">Recruiter:</span>
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-1.5 py-0.5 text-[12.5px] text-slate-700 dark:text-slate-300"
      >
        <option value="">Unassigned</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name ?? p.email}
          </option>
        ))}
      </select>
      {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
      {saved && <Check className="w-3 h-3 text-emerald-500" />}
    </span>
  );
}
