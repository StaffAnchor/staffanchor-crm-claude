"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AssignAgencyControl({
  profileId,
  agencies,
}: {
  profileId: string;
  agencies: { id: string; name: string }[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [saving, setSaving] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const agencyId = e.target.value;
    if (!agencyId) return;
    setSaving(true);
    await supabase.rpc("admin_assign_vendor_agency", { p_user_id: profileId, p_agency_id: agencyId });
    setSaving(false);
    router.refresh();
  }

  return (
    <select
      defaultValue=""
      onChange={handleChange}
      disabled={saving}
      className="text-[12px] rounded-lg border border-slate-300 px-2 py-1 disabled:opacity-50"
    >
      <option value="" disabled>
        Assign to agency...
      </option>
      {agencies.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
