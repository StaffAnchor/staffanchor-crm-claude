"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// One-click "add to this mandate's pipeline" straight from a Practice Pool
// match, instead of forcing the recruiter to open the mandate and add the
// candidate manually (the only way to act on a match before this). Same
// insert this candidate would get from the "Link to a mandate" dropdown on
// their own profile (mandate-links-panel.tsx) -- just reachable from the
// match itself.
export function PracticeMatchChip({
  candidateId,
  mandateId,
  roleTitle,
  clientName,
  dim = false,
}: {
  candidateId: string;
  mandateId: string;
  roleTitle: string;
  clientName: string;
  dim?: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  async function handleAdd(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setAdding(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("candidate_mandate_links").insert({
      candidate_id: candidateId,
      mandate_id: mandateId,
      added_by: user?.id,
    });
    setAdded(true);
    setAdding(false);
    router.refresh();
  }

  const toneClass = dim
    ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400"
    : "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300";

  return (
    <div className={`inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border ${toneClass}`}>
      <Link href={`/mandates/${mandateId}?tab=candidates`} className="hover:underline">
        {roleTitle} — {clientName}
      </Link>
      {added ? (
        <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ Added</span>
      ) : (
        <button
          onClick={handleAdd}
          disabled={adding}
          className="font-medium underline decoration-dotted hover:text-emerald-900 dark:hover:text-emerald-100 disabled:opacity-50"
        >
          {adding ? "Adding…" : "+ Add"}
        </button>
      )}
    </div>
  );
}
