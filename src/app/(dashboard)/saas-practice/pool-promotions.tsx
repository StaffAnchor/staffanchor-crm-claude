"use client";

import Link from "next/link";
import PoolControl from "@/components/pool-control";

export type Promotion = { candidate_id: string; full_name: string | null; title: string | null; employer: string | null; city: string | null; strength: string; why: string[] | null };

// People who look like pool material and are not in it: complete profiles that are strong, or good with strong pay for their experience.
// One tap adds them to the pool at the right tier, which is what makes them the first calls for every open role.
export default function PoolPromotions({ items }: { items: Promotion[] }) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Add these to the pool</h2>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
          Complete profiles the system rates strong, not in the pool yet. Open one if you want to check, or add them straight away: the pool is what gets called first when a role opens.
        </p>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map((r) => (
          <li key={r.candidate_id} className="flex items-start justify-between gap-3 rounded-ros-xl border border-amber-100 bg-amber-50/40 p-3 dark:border-amber-900/40 dark:bg-amber-950/10">
            <div className="min-w-0">
              <Link target="_blank" rel="noopener noreferrer" href={`/candidates/${r.candidate_id}`} className="text-[13.5px] font-semibold text-slate-900 hover:text-teal-700 dark:text-slate-100">
                {r.full_name ?? "Unnamed"}
              </Link>
              <p className="text-[12px] text-slate-500">
                {[r.title, r.employer].filter(Boolean).join(" at ") || "No role on file"}
                {r.city ? ` · ${r.city}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">{r.strength === "strong" ? "Strong" : "Good"}</span>
                {(r.why ?? []).slice(0, 3).map((w) => (
                  <span key={w} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">{w}</span>
                ))}
              </div>
            </div>
            <PoolControl candidateId={r.candidate_id} entry={null} compact />
          </li>
        ))}
      </ul>
    </section>
  );
}
