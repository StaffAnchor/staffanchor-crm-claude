"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flame, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Marks a role urgent. Urgent roles put the people who match them, and still lack details, at the top of Calls today.
export default function UrgentToggleButton({ mandateId, urgent }: { mandateId: string; urgent: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    await createClient().from("mandates").update({ is_urgent: !urgent }).eq("id", mandateId);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" onClick={flip} disabled={busy} className="inline-flex items-center gap-1.5 rounded-ros-md px-3.5 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-60">
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className={`h-3.5 w-3.5 ${urgent ? "text-orange-600" : ""}`} />}
      {urgent ? "Remove urgent mark" : "Mark as urgent"}
    </button>
  );
}
