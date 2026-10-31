"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// The first visit to a page after a quiet spell is slow because the server code for that page has to start up. A timed ping from the
// server cannot help (every page needs a signed-in session), so the signed-in browser does it: a few seconds after a page opens it asks
// for the main pages once, quietly and one at a time, and repeats while the tab stays open. By the time a recruiter clicks Roles or
// Profile completion the page is already awake. It skips phones on mobile data and anyone who has asked their browser to save data.
const PAGES = ["/candidates/complete", "/candidates", "/mandates", "/candidates/inventory", "/saas-practice", "/clients", "/today"];
const EVERY_MS = 7 * 60_000;
const GAP_MS = 1500;

type Conn = { saveData?: boolean; type?: string; effectiveType?: string };

export default function WarmUp() {
  const pathname = usePathname();

  useEffect(() => {
    const conn = (navigator as unknown as { connection?: Conn }).connection;
    if (conn?.saveData || conn?.type === "cellular" || /(^|-)2g$/.test(conn?.effectiveType ?? "")) return;

    let cancelled = false;
    const timers: number[] = [];

    async function round() {
      if (cancelled || document.hidden) return;
      // At most one round every seven minutes, however often the person moves between pages or reloads.
      let last = 0;
      try {
        last = Number(window.sessionStorage.getItem("warm-up-at") ?? 0);
      } catch {
        /* storage can be blocked */
      }
      if (Date.now() - last < EVERY_MS - 10_000) return;
      try {
        window.sessionStorage.setItem("warm-up-at", String(Date.now()));
      } catch {
        /* storage can be blocked */
      }
      for (const url of PAGES) {
        if (cancelled || document.hidden) return;
        if (pathname === url || pathname?.startsWith(`${url}/`)) continue;
        try {
          await fetch(url, { credentials: "include", cache: "no-store", headers: { "x-warm-up": "1" }, priority: "low" } as RequestInit);
        } catch {
          /* offline or navigating away: nothing to do */
        }
        await new Promise<void>((r) => timers.push(window.setTimeout(r, GAP_MS)));
      }
    }

    timers.push(window.setTimeout(round, 5000));
    const every = window.setInterval(round, EVERY_MS);
    return () => {
      cancelled = true;
      window.clearInterval(every);
      timers.forEach((t) => window.clearTimeout(t));
    };
    // Re-arm when the person moves to another page, so that page is skipped and the rest stay warm.
  }, [pathname]);

  return null;
}
