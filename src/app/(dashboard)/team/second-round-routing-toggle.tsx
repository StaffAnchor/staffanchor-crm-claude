"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Who "Recommended for 2nd round" (see call-disposition-control.tsx)
// actually reaches -- a plain checkbox rather than a role check, since the
// firm plans to add a non-admin "manager" role that should be able to
// receive these without being made an admin. Admin-only (this whole panel
// is gated at the page level, same as RoleControl).
export default function SecondRoundRoutingToggle({ userId, initialChecked }: { userId: string; initialChecked: boolean }) {
  const router = useRouter();
  const supabase = createClient();
  const [checked, setChecked] = useState(initialChecked);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !checked;
    setChecked(next);
    setSaving(true);
    if (next) {
      await supabase.from("call_second_round_routing").insert({ user_id: userId });
    } else {
      await supabase.from("call_second_round_routing").delete().eq("user_id", userId);
    }
    setSaving(false);
    router.refresh();
  }

  return (
    <label className="flex items-center gap-1.5 text-[11.5px] text-slate-600 dark:text-slate-400 cursor-pointer">
      <input type="checkbox" checked={checked} disabled={saving} onChange={toggle} className="rounded" />
      2nd round calls
    </label>
  );
}
