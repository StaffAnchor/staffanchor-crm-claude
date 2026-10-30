"use client";

import { useSyncExternalStore } from "react";
import { WHATSAPP_TARGET, whatsappAppLink, whatsappLink } from "@/lib/whatsapp-link";

// Where manual WhatsApp messages open: a WhatsApp Web tab, or the WhatsApp desktop app. Remembered in this browser.
export type WhatsAppOpenMode = "web" | "app";
const KEY = "sa_wa_open";
const EVENT = "sa-wa-open-changed";

function read(): WhatsAppOpenMode {
  try {
    return localStorage.getItem(KEY) === "app" ? "app" : "web";
  } catch {
    return "web";
  }
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function useWhatsAppOpen() {
  const mode = useSyncExternalStore(subscribe, read, () => "web" as WhatsAppOpenMode);
  const setMode = (m: WhatsAppOpenMode) => {
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private window: the choice just lasts until the page closes */
    }
    window.dispatchEvent(new Event(EVENT));
  };
  return {
    mode,
    setMode,
    href: (phone: string | null | undefined, text: string) => (mode === "app" ? whatsappAppLink(phone, text) : whatsappLink(phone, text)),
    // The desktop app has no tab to reuse; the web link always goes to the one shared tab.
    target: mode === "app" ? undefined : WHATSAPP_TARGET,
  };
}

export function WhatsAppOpenSwitch({ className = "" }: { className?: string }) {
  const { mode, setMode } = useWhatsAppOpen();
  const opt = (m: WhatsAppOpenMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-full px-2.5 py-1 text-[11.5px] font-medium ${mode === m ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
    >
      {label}
    </button>
  );
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500 ${className}`} title="WhatsApp Web allows one open tab per browser. The desktop app has no such limit and keeps your open chats.">
      <span>Open in</span>
      {opt("web", "Browser tab")}
      {opt("app", "Desktop app")}
    </div>
  );
}
