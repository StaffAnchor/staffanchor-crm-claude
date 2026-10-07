"use client";

import { useEffect, useState } from "react";

// Green count on the WhatsApp tab: conversations where the last message is theirs.
export default function WhatsAppNavBadge() {
  const [n, setN] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/whatsapp/summary")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && !cancelled) setN(d.needsReply ?? 0);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  if (n <= 0) return null;
  return (
    <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[10.5px] font-semibold tabular-nums text-white">{n}</span>
  );
}
