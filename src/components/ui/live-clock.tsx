"use client";

import { useEffect, useState } from "react";

// Live Day / Date / Time readout for the top nav. Ticks every second on the
// client only (mounted flag avoids an SSR/client render mismatch on the
// initial timestamp). Styled as a small "digital badge" with an amber
// accent to contrast against the header's dark background.
export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) {
    // Reserve layout space so nothing shifts once mounted.
    return <div className="hidden lg:block w-[150px]" />;
  }

  const day = now.toLocaleDateString("en-US", { weekday: "short" });
  const date = now.toLocaleDateString("en-US", { day: "2-digit", month: "short" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

  return (
    <div className="hidden lg:flex items-center gap-2.5 rounded-lg border border-amber-500/10 bg-amber-500/[0.03] px-3 py-1 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{day}</span>
        <span className="text-[10px] uppercase tracking-widest text-slate-500">{date}</span>
      </div>
      <div className="h-6 w-px bg-amber-500/10" />
      <span className="text-[14px] font-semibold tabular-nums text-amber-400/90">{time}</span>
    </div>
  );
}
