"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, Loader2, X } from "lucide-react";
import ResumeViewerInline from "../../candidates/[id]/resume-viewer-inline";
import CvActionsBar from "@/components/cv-actions-bar";

// A CV preview for long lists: the link to the file is only fetched when the button is clicked (it is short-lived), so
// a list of 100+ people does not sign 100+ files up front. Opens the same viewer as the candidate page.
export default function LazyCvPreview({ candidateId, name, variant = "compact" }: { candidateId: string; name: string | null; variant?: "compact" | "card" }) {
  const [state, setState] = useState<"idle" | "loading" | "open">("idle");
  // The link is remembered with the person it belongs to. A list or side panel can keep this component on screen
  // while the selected person changes, and a link kept from the first person must never open for the next one.
  const [fetched, setFetched] = useState<{ forId: string; url: string; fileName: string } | null>(null);
  const file = fetched && fetched.forId === candidateId ? fetched : null;
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setError(null);
    if (file) return setState("open");
    setState("loading");
    try {
      const res = await fetch(`/api/candidates/${candidateId}/cv-url`, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.url) throw new Error(j.error ?? "Couldn't open the CV.");
      setFetched({ forId: candidateId, url: j.url, fileName: j.fileName ?? `${name ?? "candidate"}-cv` });
      setState("open");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Couldn't open the CV.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={state === "loading"}
        className={variant === "card" ? "inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-teal-600 bg-white text-[14px] font-medium text-teal-700 hover:bg-teal-50 disabled:opacity-60 dark:bg-transparent dark:text-teal-300" : "inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-60 dark:bg-teal-950/30 dark:text-teal-300"}
      >
        {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} {variant === "card" ? "Preview" : "Preview CV"}
      </button>
      {error && <p className="text-[12px] text-amber-700 dark:text-amber-400">{error}</p>}
      {state === "open" && file && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-6" onClick={() => setState("idle")}>
          <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-ros-lg bg-white shadow-ros-md dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="truncate pr-4 text-[14px] font-medium text-slate-800 dark:text-slate-200">{name ? `${name} · ` : ""}{file.fileName}</p>
              <div className="flex shrink-0 items-center gap-2">
                <a href={file.url} download={file.fileName} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 text-[13px] text-slate-600 hover:text-slate-900 dark:text-slate-400">
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
                <button type="button" onClick={() => setState("idle")} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <CvActionsBar candidateId={candidateId} />
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800/50">
              <ResumeViewerInline signedUrl={file.url} fileName={file.fileName} />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
