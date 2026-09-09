"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { FileWarning, ShieldCheck } from "lucide-react";

// Resume-truth reconciliation: the same AI passport call that already
// generates ai_summary/skill_inventory (src/lib/ai-passport.ts) also reads
// the resume as ground truth and flags material conflicts against what the
// candidate self-reported in structured form fields -- e.g. self-reported
// "3 years experience" when the resume's own dated history adds up to 6+,
// or a different current employer/title. Zero new AI calls; this panel is
// purely a read + a quick action on data the existing generation already
// produces. Sits right under the AI summary panel, right above Verified
// Facts, so a recruiter sees a flagged mismatch and can turn it into a
// durable verified fact (candidate_verified_facts, fact_type
// 'resume_claims_unverified' -- the exact type that table already had a slot
// for, unused, before this feature existed) in one click.
type ResumeMismatch = {
  field: string;
  self_reported: string;
  resume_says: string;
  note?: string;
};

export default function ResumeMismatchesPanel({
  candidateId,
  mismatches,
}: {
  candidateId: string;
  mismatches: ResumeMismatch[] | null;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [flaggedIdx, setFlaggedIdx] = useState<Set<number>>(new Set());
  const [flaggingIdx, setFlaggingIdx] = useState<number | null>(null);

  if (!mismatches || mismatches.length === 0) return null;

  async function handleFlag(m: ResumeMismatch, idx: number) {
    setFlaggingIdx(idx);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const note = `${m.field}: self-reported "${m.self_reported}" vs resume "${m.resume_says}"${
      m.note ? ` -- ${m.note}` : ""
    }`;
    const { error } = await supabase.from("candidate_verified_facts").insert({
      candidate_id: candidateId,
      fact_type: "resume_claims_unverified",
      note,
      created_by: user?.id ?? null,
    });
    setFlaggingIdx(null);
    if (!error) {
      setFlaggedIdx((prev) => new Set(prev).add(idx));
      router.refresh();
    }
  }

  return (
    <div>
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5 mb-1">
        <FileWarning className="w-3.5 h-3.5 text-amber-600" /> Resume vs. profile mismatches
      </h2>
      <p className="text-[12px] text-slate-400 mb-3">
        The AI read this candidate&apos;s resume as ground truth and compared it against what they self-reported in
        their profile. Only material conflicts are shown -- worth a quick double-check before presenting this
        candidate.
      </p>
      <div className="space-y-2">
        {mismatches.map((m, idx) => (
          <div
            key={idx}
            className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-3 py-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[12.5px] font-medium text-amber-900 dark:text-amber-300">{m.field}</p>
                <p className="text-[12px] text-slate-700 dark:text-slate-300 mt-0.5">
                  Profile says <span className="font-medium">&ldquo;{m.self_reported}&rdquo;</span> — resume says{" "}
                  <span className="font-medium">&ldquo;{m.resume_says}&rdquo;</span>
                </p>
                {m.note && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1">{m.note}</p>}
              </div>
              {flaggedIdx.has(idx) ? (
                <span className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 shrink-0 pt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Flagged
                </span>
              ) : (
                <button
                  onClick={() => handleFlag(m, idx)}
                  disabled={flaggingIdx === idx}
                  className="shrink-0 text-[11px] font-medium text-amber-800 dark:text-amber-300 hover:underline disabled:opacity-50"
                >
                  {flaggingIdx === idx ? "Flagging…" : "Flag as unverified"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
