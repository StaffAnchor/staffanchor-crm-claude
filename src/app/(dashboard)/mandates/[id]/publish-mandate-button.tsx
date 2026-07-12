"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Rocket, Loader2, AlertTriangle } from "lucide-react";

// Second half of the recruiter-gated publish flow: a mandate created from
// an Employer Inquiry (or any other path) lands with status "draft", which
// public.get_open_job_listing(s) explicitly excludes -- so it is invisible
// on jobs.staffanchor.com no matter what. This button is the only thing
// that flips it to "open" (live). It's meant to be clicked only after the
// recruiter has reviewed/edited the mandate's details below.
export default function PublishMandateButton({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const supabase = createClient();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    const confirmed = window.confirm(
      "Publish this mandate? It will immediately become visible as a live job listing on jobs.staffanchor.com."
    );
    if (!confirmed) return;
    setPublishing(true);
    setError(null);
    const { error: err } = await supabase.from("mandates").update({ status: "open" }).eq("id", mandateId);
    setPublishing(false);
    if (err) {
      setError(err.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="flex-1">
        <p className="text-[13px] font-medium text-amber-900">This mandate is a draft -- not visible to candidates</p>
        <p className="text-[12px] text-amber-800 mt-0.5">
          Review and fix the details below, then publish when it&apos;s ready to go live on jobs.staffanchor.com.
        </p>
        {error && <p className="text-[12px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        onClick={handlePublish}
        disabled={publishing}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-white text-[12px] font-medium px-3 py-2 transition-colors"
      >
        {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
        {publishing ? "Publishing…" : "Publish mandate"}
      </button>
    </div>
  );
}
