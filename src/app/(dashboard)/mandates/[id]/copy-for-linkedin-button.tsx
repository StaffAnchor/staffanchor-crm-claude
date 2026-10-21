"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { linkedinJd, type LinkedinJdMandate } from "@/lib/linkedin-jd";

// Copies the job post in a form LinkedIn keeps: headers in bold and bullets as lists when pasted into the job editor
// (rich copy), headers in capitals and "•" bullets when pasted anywhere plain (a feed post).
export default function CopyForLinkedinButton({ mandate }: { mandate: LinkedinJdMandate }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const { html, text } = linkedinJd(mandate);
    setFailed(false);
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      setDone(true);
      setTimeout(() => setDone(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title="Copies the job post with headers, ready to paste into LinkedIn"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12.5px] font-medium px-3 py-1.5 transition-colors"
    >
      {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
      {done ? "Copied" : failed ? "Copy failed, try again" : "Copy for LinkedIn"}
    </button>
  );
}
