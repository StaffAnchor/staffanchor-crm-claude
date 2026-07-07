"use client";

import { useEffect, useState } from "react";
import { FileText, X, Download, Loader2 } from "lucide-react";

export default function ResumePreview({
  signedUrl,
  fileName,
  label,
}: {
  signedUrl: string;
  fileName: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const isPdf = /\.pdf$/i.test(fileName);
  const isDocx = /\.docx$/i.test(fileName);

  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [docxError, setDocxError] = useState(false);

  useEffect(() => {
    if (!open || !isDocx || html || loading) return;
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
  }, [open, isDocx, signedUrl]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
      >
        <FileText className="w-3 h-3" /> {label ?? "Preview resume"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-[13px] font-medium text-slate-800 truncate pr-4">{fileName}</p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={signedUrl}
                  download={fileName}
                  className="flex items-center gap-1 text-[12px] text-slate-600 hover:text-slate-900 px-2 py-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50">
              {isPdf ? (
                <iframe src={signedUrl} className="w-full h-full" title={`Resume — ${fileName}`} />
              ) : isDocx ? (
                loading ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
                    <p className="text-[13px] text-slate-500">Rendering document…</p>
                  </div>
                ) : docxError ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-6">
                    <FileText className="w-8 h-8 text-slate-300 mb-3" />
                    <p className="text-[13px] text-slate-600 mb-3">Couldn&apos;t render this document inline. Download it to view.</p>
                    <a
                      href={signedUrl}
                      download={fileName}
                      className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium px-4 py-2"
                    >
                      Download {fileName}
                    </a>
                  </div>
                ) : (
                  <div className="bg-white mx-auto max-w-2xl my-6 p-8 shadow-sm rounded-lg">
                    <div
                      className="text-sm leading-relaxed text-slate-800 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:text-blue-600 [&_a]:underline [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-slate-200 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:p-1.5 [&_th]:bg-slate-50"
                      dangerouslySetInnerHTML={{ __html: html ?? "" }}
                    />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <FileText className="w-8 h-8 text-slate-300 mb-3" />
                  <p className="text-[13px] text-slate-600 mb-3">
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
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
