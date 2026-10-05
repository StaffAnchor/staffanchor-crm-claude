"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

const JOBS_SITE = process.env.NEXT_PUBLIC_JOBS_SITE_URL ?? "https://jobs.staffanchor.com";

// Copies the short public link for an open job, e.g. jobs.staffanchor.com/j/k7x2mq.
export default function CopyShareLinkButton({ shortCode }: { shortCode: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${JOBS_SITE}/j/${shortCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={url}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[13px] font-medium px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy share link"}
    </button>
  );
}
