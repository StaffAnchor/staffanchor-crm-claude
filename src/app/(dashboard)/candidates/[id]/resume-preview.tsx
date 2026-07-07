"use client";

import { useState } from "react";
import { FileText, X, Download } from "lucide-react";

export default function ResumePreview({
  signedUrl,
  fileName,
}: {
  signedUrl: string;
  fileName: string;
}) {
  const [open, setOpen] = useState(false);
  const isPdf = /\.pdf$/i.test(fileName);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition-colors"
      >
        <FileText className="w-3 h-3" /> {isPdf ? "Preview resume" : "View resume"}
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
            <div className="flex-1 bg-slate-50">
              {isPdf ? (
                <iframe src={signedUrl} className="w-full h-full" title={`Resume — ${fileName}`} />
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
