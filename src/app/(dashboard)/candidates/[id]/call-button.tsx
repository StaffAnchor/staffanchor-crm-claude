"use client";

import { useEffect } from "react";
import { Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { startCall } from "@/lib/calls";

// The one Call button. It also logs the attempt, and answers the "Call them" action on the to-do list.
export default function CallButton({ candidateId, phone }: { candidateId: string; phone?: string | null }) {
  async function call() {
    if (!phone) return;
    const supabase = createClient();
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("activities").insert({ actor_id: user?.id ?? null, entity_type: "candidate", entity_id: candidateId, kind: "call" });
    })();
    void startCall({ candidateId, phone });
  }
  useEffect(() => {
    const on = () => void call();
    window.addEventListener("profile-call", on);
    return () => window.removeEventListener("profile-call", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidateId, phone]);
  if (!phone) return null;
  return (
    <button type="button" onClick={() => void call()} className="inline-flex items-center gap-1.5 rounded-ros-md border border-slate-300 bg-white px-3.5 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
      <Phone className="h-3.5 w-3.5" /> Call
    </button>
  );
}
