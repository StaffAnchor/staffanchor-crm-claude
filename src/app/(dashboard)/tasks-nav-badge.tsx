"use client";

import { useEffect, useState } from "react";

const KEY = "sa-tasks-badge";
const TTL_MS = 2 * 60 * 1000;

// Red count on the Tasks tab: late work first, otherwise what is due soon.
// Cached for two minutes in the tab so it does not refetch on every page.
export default function TasksNavBadge() {
  const [counts, setCounts] = useState<{ late: number; due: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const c = JSON.parse(raw) as { at: number; late: number; due: number };
        if (Date.now() - c.at < TTL_MS) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setCounts({ late: c.late, due: c.due });
          return;
        }
      }
    } catch {
      // storage can be blocked; just fetch
    }
    fetch("/api/tasks/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        setCounts({ late: d.late, due: d.due });
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), late: d.late, due: d.due }));
        } catch {
          // ignore
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!counts) return null;
  const n = counts.late > 0 ? counts.late : counts.due;
  if (n <= 0) return null;
  return (
    <span
      className={`ml-1.5 inline-flex min-w-[18px] h-[18px] items-center justify-center rounded-full px-1 text-[10.5px] font-semibold tabular-nums ${counts.late > 0 ? "bg-rose-500 text-white" : "bg-amber-400 text-amber-950"}`}
      aria-label={`${n} ${counts.late > 0 ? "late" : "due soon"}`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
