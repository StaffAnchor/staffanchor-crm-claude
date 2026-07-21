"use client";

import { useEffect, useState } from "react";
import { FileText, Download, Loader2 } from "lucide-react";

// The actual resume-rendering body (PDF iframe / DOCX-to-HTML), extracted out
// of resume-preview.tsx's modal so it can be reused two ways: as the
// existing standalone "Preview resume" popup (ResumePreview, unchanged), and
// embedded inline alongside the Edit Profile form (edit-profile-button.tsx)
// -- so a recruiter can have the CV open on one side while editing the
// profile on the other during a live call, instead of the CV preview
// blocking/disabling the rest of the page.
export default function ResumeViewerInline({
  signedUrl,
  fileName,
}: {
  signedUrl: string;
  fileName: string;
}) {
  const isPdf = /\.pdf$/i.test(fileName);
  const isDocx = /\.docx$/i.test(fileName);

  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  useEffect(() => {
    if (!isDocx || html || loading) return;
    let cancelled = false;
    setLoading(true);
    setDocxError(false);
    (async () => {
      try {
        const mammoth = await import("mammoth");
        const res = await fetch(signedUrl);
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) setHtml(result.value);
      } catch {
        if (!cancelled) setDocxError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocx, signedUrl]);

  if (isPdf) {
    return <iframe src={signedUrl} className="w-full h-full" title={`Resume — ${fileName}`} />;
  }

  if (isDocx) {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
          <p className="text-[13px] text-slate-500 dark:text-slate-400">Rendering document…</p>
        </div>
      );
    }
    if (docxError) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <FileText className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-3">Couldn&apos;t render this document inline. Download it to view.</p>
          <a
            href={signedUrl}
            download={fileName}
            className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium px-4 py-2"
          >
            Download {fileName}
          </a>
        </div>
      );
    }
    return (
      <div className="bg-white dark:bg-slate-900 mx-auto max-w-2xl my-6 p-8 shadow-sm rounded-lg">
        <div
          className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-slate-200 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:p-1.5 [&_th]:bg-slate-50 dark:bg-slate-800/50"
          dangerouslySetInnerHTML={{ __html: html ?? "" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <FileText className="w-8 h-8 text-slate-300 mb-3" />
      <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-3">
        This file type can&apos;t be previewed inline. Download it to view.
      </p>
      <a
        href={signedUrl}
        download={fileName}
        className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium px-4 py-2"
      >
        Download {fileName}
      </a>
    </div>
  );
}
