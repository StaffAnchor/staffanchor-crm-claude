"use client";

import { useState } from "react";
import { FileText, X, Download } from "lucide-react";
import ResumeViewerInline from "./resume-viewer-inline";

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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-ros-md px-3 py-1.5 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]"
      >
        <FileText className="w-3 h-3" /> {label ?? "Preview resume"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-ros-lg shadow-ros-md w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
              <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate pr-4">{fileName}</p>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={signedUrl}
                  download={fileName}
                  className="flex items-center gap-1 text-[12px] text-slate-600 dark:text-slate-400 hover:text-slate-900 px-2 py-1"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
                <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-800/50">
              <ResumeViewerInline signedUrl={signedUrl} fileName={fileName} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
