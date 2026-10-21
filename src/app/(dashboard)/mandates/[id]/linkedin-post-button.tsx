"use client";

import { useState } from "react";
import { Check, Copy, Loader2, MessageSquareText, RefreshCw, X } from "lucide-react";

// A short LinkedIn post for this role, drafted from the mandate. Editable here before it is copied; nothing is posted.
export default function LinkedinPostButton({ mandateId }: { mandateId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [post, setPost] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function draft() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/linkedin-post`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.post) throw new Error(j.error ?? "Couldn't draft the post.");
      setPost(j.post);
      setNote([j.ai ? null : "The AI draft failed, so this is a standard post.", j.hasLink ? null : "This role isn't open with a public link yet, so there is no job link in the post."].filter(Boolean).join(" ") || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft the post.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(post);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy. Select the text and copy it by hand.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          if (!post) void draft();
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12.5px] font-medium px-3 py-1.5 transition-colors"
      >
        <MessageSquareText className="w-3.5 h-3.5" /> LinkedIn post
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xl rounded-ros-lg bg-white p-5 shadow-ros-md dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Short LinkedIn post</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            {busy && !post ? (
              <p className="flex items-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Drafting from the mandate…</p>
            ) : (
              <textarea value={post} onChange={(e) => setPost(e.target.value)} rows={13} className="w-full rounded-lg border border-slate-200 bg-white p-3 text-[13.5px] leading-relaxed text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" />
            )}
            {note && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{note}</p>}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <p className="mt-2 text-xs text-slate-500">Edit if you like, then copy and paste it into LinkedIn. Check it before posting.</p>
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={draft} disabled={busy} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 dark:text-slate-300">
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Write another
              </button>
              <button type="button" onClick={copy} disabled={!post} className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
