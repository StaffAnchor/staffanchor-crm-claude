"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_LABEL, NOT_A_FIT_REASONS, notAFitLabel, STRENGTH_FLAGS } from "@/lib/not-a-fit-reasons";

const MARKABLE = NOT_A_FIT_REASONS.filter((r) => r.scope !== "role");
const CATS = ["strength", "selling", "track", "people"];

export async function saveSalesFlags(candidateId: string, flags: string[], mandateId?: string) {
  if (flags.length === 0) return;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  await supabase
    .from("candidate_sales_flags")
    .upsert(flags.map((flag) => ({ candidate_id: candidateId, flag, mandate_id: mandateId ?? null, set_by: user?.id ?? null })), { onConflict: "candidate_id,flag", ignoreDuplicates: true });
}

// What the team has learned about this person as a seller. These lower them on every role they are ranked for.
export default function SalesFlagsPanel({ candidateId }: { candidateId: string }) {
  const [flags, setFlags] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let live = true;
    createClient()
      .from("candidate_sales_flags")
      .select("flag")
      .eq("candidate_id", candidateId)
      .then(({ data }) => live && setFlags(((data ?? []) as { flag: string }[]).map((d) => d.flag)));
    return () => {
      live = false;
    };
  }, [candidateId]);

  async function add(flag: string) {
    setAdding(false);
    setFlags((f) => (f.includes(flag) ? f : [...f, flag]));
    await saveSalesFlags(candidateId, [flag]);
  }
  async function remove(flag: string) {
    setFlags((f) => f.filter((x) => x !== flag));
    await createClient().from("candidate_sales_flags").delete().eq("candidate_id", candidateId).eq("flag", flag);
  }

  const free = MARKABLE.filter((r) => !flags.includes(r.value));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Seller notes</h3>
      <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">What we have learned about how this person sells. It Strengths raise them in matches for every role, concerns lower them.</p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {flags.length === 0 && <span className="text-[12.5px] text-slate-400">Nothing marked.</span>}
        {flags.map((f) => (
          <span key={f} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium ${STRENGTH_FLAGS.includes(f) ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300"}`}>
            {notAFitLabel(f)}
            <button type="button" onClick={() => void remove(f)} aria-label={`Remove ${notAFitLabel(f)}`} className="rounded-full p-0.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/40">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {free.length > 0 && (
          <div className="relative">
            <button type="button" onClick={() => setAdding((v) => !v)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[12px] font-medium text-slate-500 hover:border-teal-400 hover:text-teal-700 dark:border-slate-600">
              <Plus className="h-3 w-3" /> Add
            </button>
            {adding && (
              <div className="absolute left-0 top-full z-20 mt-1 max-h-[70vh] w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                {CATS.map((cat) => {
                  const items = free.filter((r) => r.category === cat);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat}>
                      <p className="px-2.5 pb-0.5 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{CATEGORY_LABEL[cat]}</p>
                      {items.map((r) => (
                        <button key={r.value} type="button" onClick={() => void add(r.value)} className="block w-full rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
                          <span className="block text-[13px] font-medium text-slate-900 dark:text-slate-100">{r.title}</span>
                          <span className="block text-[11px] text-slate-500">{r.hint}</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
