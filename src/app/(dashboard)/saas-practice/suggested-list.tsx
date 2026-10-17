"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import WhatsAppMenu from "@/components/whatsapp-menu";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { gapKeys } from "@/lib/saas-passport";
import type { Suggestion } from "@/lib/pool-suggest";

// The call list, built for you: bench people who look like pool material on paper and nobody has spoken to.
export default function SuggestedList({ items }: { items: Suggestion[] }) {
  const me = useMyFirstName();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Speak to these next</h2>
        <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
          Ranked by: a fit for a role that is open today, what they have sold, how long they stay in jobs, and companies you rate. They have not had a call logged. Call them, then write the note on their profile and the system does the rest.
        </p>
      </div>
      <ul className="grid gap-2 md:grid-cols-2">
        {items.map(({ row: r, reasons, cautions }) => (
          <li key={r.candidate_id} className="flex gap-3 rounded-ros-xl border border-teal-100 bg-teal-50/40 p-3 dark:border-teal-900/40 dark:bg-teal-950/10">
            <div className="min-w-0 flex-1">
              <Link href={`/candidates/${r.candidate_id}`} className="text-[13.5px] font-semibold text-slate-900 hover:text-teal-600 dark:text-slate-100">
                {r.full_name ?? "Unnamed"}
              </Link>
              <p className="text-[12px] text-slate-500">
                {[r.current_job_title, r.current_employer].filter(Boolean).join(" at ") || "No role on file"}
                {r.city ? ` · ${r.city}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {reasons.map((x) => (
                  <span key={x} className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                    {x}
                  </span>
                ))}
                {cautions.map((x) => (
                  <span key={x} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800">
                    ⚠ {x}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5">
              <Link href={`/candidates/${r.candidate_id}`} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-500">
                <Phone className="h-3.5 w-3.5" /> Call &amp; log
              </Link>
              <WhatsAppMenu
                phone={r.phone}
                templates={candidateTemplates(r.full_name, { me, candidateId: r.candidate_id, missing: gapKeys(r) }).filter((t) => t.key !== "intro")}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-white dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
