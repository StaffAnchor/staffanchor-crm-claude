"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, ChevronDown, Copy, Check } from "lucide-react";
import { WHATSAPP_TARGET, whatsappLink, type WhatsAppTemplate } from "@/lib/whatsapp-link";
import { MANUAL_TEXT } from "@/components/whatsapp-mode";
import WhatsAppComposer from "@/components/whatsapp-composer";

// "WhatsApp" button with a short list of ready-made messages. Picking one
// opens WhatsApp Web (shared tab) with that text already typed in; the
// recruiter can edit it there before sending.
export default function WhatsAppMenu({
  phone,
  templates,
  onSend,
  onIntroduce,
  context,
  className,
}: {
  phone: string | null | undefined;
  templates: WhatsAppTemplate[];
  onSend?: (templateKey: string) => void;
  // When given, the first entry is "Share an opportunity…" and opens the opportunity picker instead of a fixed message.
  onIntroduce?: () => void;
  // Who the message is for and which role, so the AI helper can word it well. Optional.
  context?: { name?: string | null; role?: string | null };
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function copy(key: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1800);
      onSend?.(key);
    } catch {
      /* clipboard blocked: the Open link still works */
    }
  }

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!phone || !whatsappLink(phone, "x")) return null;

  return (
    <div ref={ref} className="relative inline-block">
      {composing && <WhatsAppComposer phone={phone} name={context?.name} role={context?.role} onClose={() => setComposing(false)} onUsed={() => onSend?.("custom")} />}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={className} title={MANUAL_TEXT}>
        <MessageCircle className="w-3 h-3" /> WhatsApp <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-30 mt-1 w-72 rounded-ros-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-1 rounded bg-slate-50 px-2.5 py-2 text-xs leading-4 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <span className="font-semibold">Manual.</span> These are drafts. Picking one opens WhatsApp Web in your browser with the text typed in, and
            you press Send yourself. Nothing goes out automatically. For an automatic, approved-template message, use the Auto buttons.
          </p>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setComposing(true);
            }}
            className="block w-full rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-slate-800"
          >
            ✎ Write my own message…
          </button>
          {onIntroduce && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onIntroduce();
              }}
              className="block w-full rounded px-2.5 py-1.5 text-left text-[12.5px] font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-slate-800"
            >
              Share an opportunity…
            </button>
          )}
          {templates.map((t) => (
            <div key={t.key} className="flex items-center gap-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
              <a
                role="menuitem"
                href={whatsappLink(phone, t.text) ?? "#"}
                target={WHATSAPP_TARGET}
                rel="noreferrer"
                onClick={() => {
                  setOpen(false);
                  onSend?.(t.key);
                }}
                title="Manual: opens WhatsApp Web with this message typed in. You press Send."
                className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 dark:text-slate-200"
              >
                {t.label}
              </a>
              <button
                type="button"
                onClick={() => copy(t.key, t.text)}
                title="Copy this message"
                className="mr-1 inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-white hover:text-slate-800 dark:hover:bg-slate-700 dark:hover:text-slate-100"
              >
                {copied === t.key ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />} {copied === t.key ? "Copied" : "Copy"}
              </button>
            </div>
          ))}
          <a
            role="menuitem"
            href={whatsappLink(phone, "") ?? "#"}
            target={WHATSAPP_TARGET}
            rel="noreferrer"
            onClick={() => {
              setOpen(false);
              onSend?.("blank");
            }}
            className="mt-1 block rounded border-t border-slate-100 px-2.5 py-1.5 text-left text-[12.5px] text-slate-500 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800"
          >
            Open an empty chat in WhatsApp
          </a>
        </div>
      )}
    </div>
  );
}
