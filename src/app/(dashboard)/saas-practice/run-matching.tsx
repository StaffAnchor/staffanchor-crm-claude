"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2 } from "lucide-react";

type Role = { id: string; title: string };

// Runs the AI match for each open B2B role in turn, so the bench is checked
// against every role without opening them one by one. Each role checks the
// next batch of best candidates; press again for more.
export default function RunMatching({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setDone(0);
    setMessage(null);
    let failed = 0;
    let firstError: string | null = null;
    for (let i = 0; i < roles.length; i++) {
      try {
        const res = await fetch(`/api/mandates/${roles[i].id}/ai-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ limit: 30 }),
        });
        if (!res.ok) {
          failed += 1;
          const body = await res.json().catch(() => ({}));
          firstError = firstError ?? (body.error as string | undefined) ?? `Role "${roles[i].title}" could not be checked`;
          if (/paused by an admin/i.test(firstError)) break;
        }
      } catch {
        failed += 1;
      }
      setDone(i + 1);
    }
    setRunning(false);
    setMessage(failed ? `${roles.length - failed} of ${roles.length} roles checked. ${firstError ?? ""}` : `All ${roles.length} roles checked.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={running || roles.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
      >
        {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {running ? `Checking role ${Math.min(done + 1, roles.length)} of ${roles.length}…` : "Find matches for all B2B roles"}
      </button>
      {message && <span className="text-[12.5px] text-slate-600 dark:text-slate-300">{message}</span>}
    </div>
  );
}
