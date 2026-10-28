"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function MarkSeenButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    await createClient().from("client_portal_events").update({ seen_at: new Date().toISOString() }).is("seen_at", null);
    setBusy(false);
    router.refresh();
  }
  return (
    <button type="button" onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
      <Check className="h-4 w-4" /> Mark all seen
    </button>
  );
}
