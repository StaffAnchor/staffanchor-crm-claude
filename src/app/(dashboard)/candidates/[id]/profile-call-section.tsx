"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import CallRecordForm, { type CallFormPerson, type CallResult } from "../call-record-form";
import { POOL_TIER_LABEL, type PoolTier } from "@/lib/talent-pool";

export type PastDebrief = { id: string; created_at: string; author: string | null; raw_note: string; summary: string | null };

// The profile's call section: the same form as Calls today, so a call is recorded one way everywhere, with what the
// system did shown right after saving and the earlier calls underneath.
export default function ProfileCallSection({ person, doubts, history }: { person: CallFormPerson; doubts: string[]; history: PastDebrief[] }) {
  const router = useRouter();
  const [last, setLast] = useState<CallResult | null>(null);
  const [round, setRound] = useState(0);

  const OUT: Record<string, string> = { reached: "Call saved", no_answer: "Logged: no answer", call_later: "Logged: call back", not_interested: "Logged: not interested", wrong_number: "Logged: wrong number" };

  return (
    <div>
      {last && (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12.5px] text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200">
          <p className="flex items-center gap-1.5 font-semibold">
            <Check className="h-4 w-4" /> {OUT[last.outcome] ?? "Saved"}.{last.tier ? ` Talent Pool: ${POOL_TIER_LABEL[last.tier as PoolTier] ?? last.tier}.` : ""}
          </p>
          {last.summary && <p className="mt-0.5">{last.summary}</p>}
          {last.filled.length > 0 && <p className="mt-0.5">Filled in: {last.filled.join(", ")}.</p>}
          {last.concerns.length > 0 && <p className="mt-0.5 text-amber-800 dark:text-amber-300">Concerns noted: {last.concerns.join("; ")}.</p>}
          {(last.summary || last.reading) && <p className="mt-0.5 text-emerald-800/80 dark:text-emerald-300/80">{last.reading ? "Your note is being read in the background. The details it fills, the client brief and the role matches update within a minute." : "The client brief and the role matches are being refreshed."}</p>}
        </div>
      )}
      <CallRecordForm
        key={round}
        p={person}
        doubts={doubts}
        mode="profile"
        onDone={(r) => {
          setLast(r);
          setRound((n) => n + 1);
          router.refresh();
        }}
      />
      {history.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[12px] font-semibold text-slate-600 dark:text-slate-300">Earlier calls</p>
          <ul className="space-y-2">
            {history.map((h) => (
              <li key={h.id} className="rounded-ros-md bg-slate-50 px-3 py-2 text-[12.5px] dark:bg-slate-800/50">
                <p className="text-xs text-slate-400">
                  {new Date(h.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  {h.author ? ` · ${h.author}` : ""}
                </p>
                <p className="text-slate-700 dark:text-slate-200">{h.summary ?? h.raw_note}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
