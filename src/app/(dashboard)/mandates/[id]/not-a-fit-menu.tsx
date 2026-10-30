"use client";

import { useEffect, useRef, useState } from "react";

import { Briefcase, ChevronDown, Cloud, Coins, Handshake, IndianRupee, Layers, MapPin, Magnet, MessageSquare, MoreHorizontal, PhoneOff, Shuffle, Tag, Target, Filter } from "lucide-react";
import { NOT_A_FIT_REASONS } from "@/lib/not-a-fit-reasons";

const ICONS: Record<string, typeof Briefcase> = {
  briefcase: Briefcase, layers: Layers, tag: Tag, pin: MapPin, rupee: IndianRupee, phone: PhoneOff, funnel: Filter, target: Target,
  handshake: Handshake, cloud: Cloud, coins: Coins, magnet: Magnet, shuffle: Shuffle, message: MessageSquare, dots: MoreHorizontal,
};

export default function NotAFitMenu({ onPick }: { onPick: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const close = () => setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  function toggle() {
    if (!open && btn.current) {
      const r = btn.current.getBoundingClientRect();
      // Open below the button, right edges aligned; flip above if it would run off the bottom of the screen.
      const height = Math.min(window.innerHeight - 16, 15 * 46 + 80);
      const top = r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 4) : r.bottom + 4;
      setPos({ top, left: Math.max(8, r.right - 300) });
    }
    setOpen((v) => !v);
  }

  return (
    <>
      <button ref={btn} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} className="flex w-full items-center justify-between gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
        Not a fit
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {open && pos && (
        <div ref={menu} role="menu" style={{ position: "fixed", top: pos.top, left: pos.left, width: 300, maxHeight: "calc(100vh - 16px)" }} className="z-[60] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          {(["role", "person"] as const).map((scope) => (
            <div key={scope}>
              <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {scope === "role" ? "Not right for this role" : "About the person (remembered for other roles)"}
              </p>
              {NOT_A_FIT_REASONS.filter((r) => (scope === "role" ? r.scope === "role" && r.value !== "other" : r.scope === "person")).map((r) => {
                const Icon = ICONS[r.icon] ?? MoreHorizontal;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      onPick(r.value);
                    }}
                    title={r.hint}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${r.tone}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[13px] font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                      <span className="block truncate text-[11px] leading-4 text-slate-500 dark:text-slate-400">{r.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPick("other"); }} className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-600"><MoreHorizontal className="h-3.5 w-3.5" /></span>
            Other reason
          </button>
        </div>
      )}
    </>
  );
}
