"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, ChevronDown } from "lucide-react";
import { WHATSAPP_TARGET, whatsappLink, type WhatsAppTemplate } from "@/lib/whatsapp-link";

// "WhatsApp" button with a short list of ready-made messages. Picking one
// opens WhatsApp Web (shared tab) with that text already typed in; the
// recruiter can edit it there before sending.
export default function WhatsAppMenu({
  phone,
  templates,
  onSend,
  onIntroduce,
  className,
}: {
  phone: string | null | undefined;
  templates: WhatsAppTemplate[];
  onSend?: (templateKey: string) => void;
  // When given, the first entry is "Share an opportunity…" and opens the opportunity picker instead of a fixed message.
  onIntroduce?: () => void;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} className={className}>
        <MessageCircle className="w-3 h-3" /> WhatsApp <ChevronDown className="w-3 h-3 opacity-60" />
      </button>
      {open && (
        <div role="menu" className="absolute left-0 z-30 mt-1 w-60 rounded-ros-md border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
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
            <a
              key={t.key}
              role="menuitem"
              href={whatsappLink(phone, t.text) ?? "#"}
              target={WHATSAPP_TARGET}
              rel="noreferrer"
              onClick={() => {
                setOpen(false);
                onSend?.(t.key);
              }}
              className="block rounded px-2.5 py-1.5 text-left text-[12.5px] text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {t.label}
            </a>
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
            Open chat, write my own
          </a>
        </div>
      )}
    </div>
  );
}
