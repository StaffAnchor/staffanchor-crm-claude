"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { kindFromName, kindFromBytes, MAX_DOC_PREVIEW_BYTES, type ResumeKind } from "@/lib/resume-kind";

// The actual resume-rendering body, shared by every CV preview in the CRM and the client views: PDF in a frame,
// .docx converted to HTML, old .doc as plain text, images shown directly. The file name decides the type first;
// when the name is missing or wrong, the first bytes of the file decide (a .docx that is really an old .doc, or a
// file saved with no extension).
// Mammoth carries a DOCX's own hyperlinks (LinkedIn URL, portfolio links,
// etc.) straight into the converted HTML with no target attribute, so
// clicking one inside this preview navigated the whole CRM tab away
// instead of opening alongside it -- add target="_blank" (and the usual
// noopener/noreferrer safety) to every link that doesn't already specify
// a target, without otherwise touching the resume's own formatting.
function addBlankTargetToLinks(html: string): string {
  return html.replace(/<a\s+([^>]*?)>/gi, (match, attrs: string) => {
    if (!/href\s*=/.test(attrs)) return match;
    if (/target\s*=/.test(attrs)) return match;
    return `<a ${attrs} target="_blank" rel="noopener noreferrer">`;
  });
}

type View = { state: "loading" } | { state: "pdf" } | { state: "image" } | { state: "docx"; html: string } | { state: "doc"; text: string } | { state: "fallback"; message: string };

const DOWNLOAD_HINT = "Download it to view.";

export default function ResumeViewerInline({
  signedUrl,
  fileName,
}: {
  signedUrl: string;
  fileName: string;
}) {
  const named = kindFromName(fileName);
  // pdf and image names need no look inside the file; anything else is fetched and sniffed. The result is kept with
  // the link it was made for, so a new link shows the loading state until its own result arrives.
  const direct = named === "pdf" || named === "image";
  const [fetched, setFetched] = useState<{ url: string; view: View } | null>(null);
  const view: View = direct ? { state: named } : fetched && fetched.url === signedUrl ? fetched.view : { state: "loading" };

  useEffect(() => {
    if (direct) return;
    let cancelled = false;
    const done = (v: View) => {
      if (!cancelled) setFetched({ url: signedUrl, view: v });
    };
    (async () => {
      try {
        const res = await fetch(signedUrl);
        const arrayBuffer = await res.arrayBuffer();
        const kind: ResumeKind = kindFromBytes(new Uint8Array(arrayBuffer, 0, 8));
        if (kind === "pdf" || kind === "image") return done({ state: kind });
        if (kind === "docx") {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer });
          return done({ state: "docx", html: addBlankTargetToLinks(result.value) });
        }
        if (kind === "doc") {
          if (arrayBuffer.byteLength > MAX_DOC_PREVIEW_BYTES) return done({ state: "fallback", message: `This document is too large to preview here. ${DOWNLOAD_HINT}` });
          const r = await fetch("/api/resume-preview/doc-text", { method: "POST", body: arrayBuffer });
          const j = (await r.json().catch(() => ({}))) as { text?: string };
          if (r.ok && j.text) return done({ state: "doc", text: j.text });
          return done({ state: "fallback", message: `Couldn't read this old Word document here. ${DOWNLOAD_HINT}` });
        }
        done({ state: "fallback", message: `This file type can't be previewed inline. ${DOWNLOAD_HINT}` });
      } catch {
        done({ state: "fallback", message: `Couldn't render this document inline. ${DOWNLOAD_HINT}` });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [direct, signedUrl]);

  if (view.state === "pdf") {
    // Reverted: sandboxing this iframe (to stop a same-tab link hijack)
    // broke PDF rendering outright -- Chrome's built-in PDF viewer treats
    // Supabase's signed URL as a download inside a sandboxed frame and
    // refuses it entirely ("This page has been blocked by Chrome"), which
    // is strictly worse than the link-target issue it was meant to fix.
    // Left unsandboxed; the DOCX-side target="_blank" fix still
    // covers the common case.
    return <iframe src={`${signedUrl.split("#")[0]}#navpanes=0`} className="w-full h-full" title={`Resume — ${fileName}`} />;
  }

  if (view.state === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={signedUrl} alt={`Resume — ${fileName}`} className="mx-auto max-w-full h-auto my-6 bg-white shadow-sm rounded-lg" />;
  }

  if (view.state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
        <p className="text-[13px] text-slate-500 dark:text-slate-400">Rendering document…</p>
      </div>
    );
  }

  if (view.state === "docx") {
    return (
      <div className="bg-white dark:bg-slate-900 mx-auto max-w-2xl my-6 p-8 shadow-sm rounded-lg">
        <div
          className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1.5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:text-teal-600 [&_a]:underline [&_table]:border-collapse [&_table]:my-2 [&_td]:border [&_td]:border-slate-200 [&_td]:p-1.5 [&_th]:border [&_th]:border-slate-200 [&_th]:p-1.5 [&_th]:bg-slate-50 dark:bg-slate-800/50"
          dangerouslySetInnerHTML={{ __html: view.html }}
        />
      </div>
    );
  }

  if (view.state === "doc") {
    return (
      <div className="bg-white dark:bg-slate-900 mx-auto max-w-2xl my-6 p-8 shadow-sm rounded-lg">
        <p className="text-[11px] text-slate-400 mb-3">Old Word format: showing the text only. Download the file to see the original layout.</p>
        <div className="text-sm leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap break-words">{view.text}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <FileText className="w-8 h-8 text-slate-300 mb-3" />
      <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-3">{view.message}</p>
      <a
        href={signedUrl}
        download={fileName}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-medium px-4 py-2"
      >
        Download {fileName}
      </a>
    </div>
  );
}
