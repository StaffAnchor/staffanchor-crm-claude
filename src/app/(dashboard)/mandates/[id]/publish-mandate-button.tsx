"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Rocket, Loader2, AlertTriangle, Sparkles, ChevronDown, ChevronUp } from "lucide-react";

type PreviewMatch = { candidate_id: string; full_name: string; score: number; reason: string };

// Second half of the recruiter-gated publish flow: a mandate created from
// an Employer Inquiry (or any other path) lands with status "draft", which
// public.get_open_job_listing(s) explicitly excludes -- so it is invisible
// on jobs.staffanchor.com no matter what. This button is the only thing
// that flips it to "open" (live). It's meant to be clicked only after the
// recruiter has reviewed/edited the mandate's details below.
export default function PublishMandateButton({
  mandateId,
  staffCount,
}: {
  mandateId: string;
  // Internal recruiter/vendor staffing count (mandate_assignments). Required
  // before publish as a safety net for older drafts created before this
  // became mandatory at creation time -- new mandates always have one already.
  staffCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missingOwner = staffCount === 0;

  // Sample-candidates preview -- reuses the same matching engine as the
  // "Find matching candidates" panel, but surfaced right where a recruiter
  // is about to go live, so a miscalibrated JD/must-haves (wrong seniority
  // band, unrealistic requirement) gets caught before publishing rather
  // than after a week of thin applications.
  const [preview, setPreview] = useState<PreviewMatch[] | null>(null);
  const [previewScanned, setPreviewScanned] = useState(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);

  async function runPreview() {
    setPreviewLoading(true);
    setPreviewError("");
    try {
      const res = await fetch("/api/mandate-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mandateId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPreviewError(json.error ?? "Preview failed.");
      } else {
        setPreview((json.matches ?? []).slice(0, 5));
        setPreviewScanned(json.scanned ?? 0);
        setPreviewOpen(true);
      }
    } catch {
      setPreviewError("Preview failed. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handlePublish() {
    if (missingOwner) return;
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
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="text-[13px] font-medium text-amber-900">This mandate is a draft -- not visible to candidates</p>
          <p className="text-[12px] text-amber-800 mt-0.5">
            Review and fix the details below, then publish when it&apos;s ready to go live on jobs.staffanchor.com.
          </p>
          {missingOwner && (
            <p className="text-[12px] text-amber-900 font-medium mt-1">
              Assign a recruiter or vendor (above) before publishing -- required for internal tracking.
            </p>
          )}
          {error && <p className="text-[12px] text-red-600 mt-1">{error}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={handlePublish}
            disabled={publishing || missingOwner}
            title={missingOwner ? "Assign a recruiter first" : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-[12px] font-medium px-3 py-2 transition-colors"
          >
            {publishing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            {publishing ? "Publishing…" : "Publish mandate"}
          </button>
          <button
            onClick={runPreview}
            disabled={previewLoading}
            className="flex items-center gap-1 text-[11px] font-medium text-amber-800 hover:text-amber-950 underline decoration-dotted disabled:opacity-60"
          >
            {previewLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {previewLoading ? "Checking pool…" : preview ? "Re-check matches" : "Preview who'd match first"}
          </button>
        </div>
      </div>

      {previewError && <p className="text-[12px] text-red-600 mt-2">{previewError}</p>}

      {preview && (
        <div className="mt-3 rounded-lg border border-amber-200/70 bg-white/70 dark:bg-slate-900/40 p-3">
          <button
            onClick={() => setPreviewOpen((o) => !o)}
            className="flex w-full items-center justify-between text-[12px] font-medium text-amber-900"
          >
            <span>
              {preview.length > 0
                ? `${preview.length} of ${previewScanned} candidates in the pool look like a fit right now`
                : `No strong matches in the current candidate pool of ${previewScanned}`}
            </span>
            {previewOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {previewOpen && preview.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {preview.map((p) => (
                <div key={p.candidate_id} className="flex items-start justify-between gap-2 text-[12px]">
                  <div className="min-w-0">
                    <Link href={`/candidates/${p.candidate_id}`} className="font-medium text-slate-800 dark:text-slate-200 hover:text-blue-600">
                      {p.full_name}
                    </Link>
                    <span className="ml-1.5 text-slate-500 dark:text-slate-400">{p.reason}</span>
                  </div>
                  <span className="shrink-0 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          )}
          {previewOpen && preview.length === 0 && (
            <p className="mt-1 text-[12px] text-amber-800">
              Worth a second look at the must-haves / experience band / location before publishing -- nothing in the
              current pool clears the bar as-is.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
