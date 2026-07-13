"use client";

import { FileDown } from "lucide-react";

// Hits /api/mandates/[id]/jd-pdf directly -- a plain navigation (not fetch)
// so the browser handles the Content-Disposition: attachment response and
// downloads the file, no client-side blob handling needed. Once downloaded,
// the recruiter can forward the PDF file however they like (WhatsApp,
// personal email, print) -- this is what makes it usable for candidates who
// aren't in our database at all, not just linked ones (see the "Email JD"
// bulk action on the candidate table below for that flow).
export default function DownloadJdButton({ mandateId }: { mandateId: string }) {
  return (
    <a
      href={`/api/mandates/${mandateId}/jd-pdf`}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12.5px] font-medium px-3 py-1.5 transition-colors"
    >
      <FileDown className="w-3.5 h-3.5" />
      Download JD PDF
    </a>
  );
}
