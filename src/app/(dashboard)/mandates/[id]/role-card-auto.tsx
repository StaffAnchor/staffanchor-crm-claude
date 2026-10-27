"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";

// No card yet: write it straight away from the mandate, then show the ranking. Nobody has to ask.
export default function RoleCardAuto({ mandateId }: { mandateId: string }) {
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);
    try {
      const res = await fetch(`/api/mandates/${mandateId}/role-card`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (d.ok) router.refresh();
      else setError(d.error ?? "Couldn't write the role card.");
    } catch {
      setError("Couldn't reach the server.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-ros-xl border border-teal-200 bg-teal-50/40 p-5 text-[13px] dark:border-teal-900 dark:bg-teal-950/10">
      {error ? (
        <div className="space-y-2">
          <p className="text-rose-600">{error}</p>
          <button type="button" onClick={() => void run()} className="rounded-lg bg-teal-600 px-3 py-1.5 font-semibold text-white hover:bg-teal-500">
            Try again
          </button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> <Sparkles className="h-4 w-4 text-teal-600" /> Reading the role and finding the best people in your database…
        </p>
      )}
    </div>
  );
}
