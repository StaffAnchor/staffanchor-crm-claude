"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, MessageCircle, Sparkles, Undo2, X } from "lucide-react";
import { useWhatsAppOpen, WhatsAppOpenSwitch } from "@/lib/use-whatsapp-open";

const TONES: { action: string; label: string }[] = [
  { action: "shorter", label: "Shorter" },
  { action: "warmer", label: "Warmer" },
  { action: "formal", label: "More formal" },
];

// Write your own WhatsApp message inside the CRM, polish it with AI, then open it in WhatsApp Web. Nothing is sent from
// here: "Open in WhatsApp" only puts the text in the chat, and the recruiter presses Send there.
export default function WhatsAppComposer({
  phone,
  name,
  role,
  onClose,
  onUsed,
}: {
  phone: string;
  name?: string | null;
  role?: string | null;
  onClose: () => void;
  onUsed?: () => void;
}) {
  const [text, setText] = useState("");
  const [before, setBefore] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    box.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const first = (name ?? "").trim().split(/\s+/)[0];
  const trimmed = text.trim();
  const rough = trimmed.length < 40;

  async function run(action: string) {
    if (!trimmed) return;
    setBusy(action);
    setErr(null);
    try {
      const res = await fetch("/api/whatsapp/improve-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: trimmed, action, name, role }) });
      const j = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !j.text) setErr(j.error ?? "Could not improve that. Try again.");
      else {
        setBefore(text);
        setText(j.text);
      }
    } catch {
      setErr("Could not reach the AI. You can still send your own text.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(trimmed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      onUsed?.();
    } catch {
      /* clipboard blocked: Open in WhatsApp still works */
    }
  }

  const wa = useWhatsAppOpen();
  const link = wa.href(phone, trimmed);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Write a WhatsApp message" className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-[16px] font-semibold text-slate-900 dark:text-slate-100">
              <MessageCircle className="h-4 w-4 text-emerald-600" /> Message{first ? ` ${first}` : ""}
            </h3>
            <p className="mt-0.5 text-[12.5px] text-slate-500">Nothing is sent from here. Open in WhatsApp puts this text in the chat and you press Send.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <textarea
          ref={box}
          id="wa-composer-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={7}
          maxLength={1500}
          placeholder={role ? `Type your message, or a few rough words (for example "ask if open to a call tomorrow about ${role}") and let AI write it.` : `Type your message, or a few rough words about what to say, and let AI write it.`}
          className="mt-3 w-full resize-y rounded-xl border border-slate-200 px-3 py-2.5 text-[14px] leading-6 text-slate-900 outline-none focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <div className="mt-1 flex items-center justify-between text-[12px] text-slate-400">
          <span>{trimmed.length} / 1,500</span>
          {before !== null && (
            <button type="button" onClick={() => { setText(before); setBefore(null); }} className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
              <Undo2 className="h-3 w-3" /> Undo AI change
            </button>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run("auto")}
            disabled={!trimmed || busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy === "auto" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {rough ? "Write it with AI" : "Improve with AI"}
          </button>
          {TONES.map((t) => (
            <button
              key={t.action}
              type="button"
              onClick={() => run(t.action)}
              disabled={!trimmed || busy !== null}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {busy === t.action && <Loader2 className="h-3 w-3 animate-spin" />} {t.label}
            </button>
          ))}
        </div>
        {err && <p className="mt-2 text-[13px] text-rose-600">{err}</p>}

        <WhatsAppOpenSwitch className="mt-3 justify-end" />
        <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button type="button" onClick={copy} disabled={!trimmed} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </button>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-2 text-[13px] text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <a
            href={trimmed && link ? link : undefined}
            target={wa.target}
            rel="noreferrer"
            aria-disabled={!trimmed}
            onClick={(e) => {
              if (!trimmed) {
                e.preventDefault();
                return;
              }
              onUsed?.();
              onClose();
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-emerald-500 ${trimmed ? "" : "pointer-events-none opacity-50"}`}
          >
            <MessageCircle className="h-3.5 w-3.5" /> Open in WhatsApp
          </a>
        </div>
      </div>
    </div>
  );
}
