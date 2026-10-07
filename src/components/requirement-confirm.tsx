"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  BASIS_LABEL,
  confirmationKey,
  confirmationMap,
  type Confirmation,
  type EvidenceBasis,
} from "@/lib/requirement-confirmations";

// Loads this mandate's call-confirmed answers once, lets the screen save or
// undo one, and keeps the map in step so every chip updates instantly.
export function useConfirmations(mandateId: string) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Confirmation[]>([]);

  useEffect(() => {
    let alive = true;
    supabase
      .from("requirement_confirmations")
      .select("candidate_id, requirement, status, note, confirmed_by_name")
      .eq("mandate_id", mandateId)
      .then(({ data }) => {
        if (alive) setRows((data ?? []) as Confirmation[]);
      });
    return () => {
      alive = false;
    };
  }, [supabase, mandateId]);

  const map = useMemo(() => confirmationMap(rows), [rows]);

  const save = useCallback(
    async (candidateId: string, requirement: string, status: "met" | "not_met", note: string): Promise<string | null> => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: prof } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };
      const row: Confirmation = {
        candidate_id: candidateId,
        requirement,
        status,
        note: note.trim() || null,
        confirmed_by_name: prof?.full_name ?? null,
      };
      const { error } = await supabase.from("requirement_confirmations").upsert(
        { ...row, mandate_id: mandateId, confirmed_by: user?.id ?? null, confirmed_at: new Date().toISOString() },
        { onConflict: "candidate_id,mandate_id,requirement" }
      );
      if (error) return error.message;
      setRows((cur) => [...cur.filter((r) => confirmationKey(r.candidate_id, r.requirement) !== confirmationKey(candidateId, requirement)), row]);
      return null;
    },
    [supabase, mandateId]
  );

  const clear = useCallback(
    async (candidateId: string, requirement: string): Promise<string | null> => {
      const { error } = await supabase
        .from("requirement_confirmations")
        .delete()
        .eq("mandate_id", mandateId)
        .eq("candidate_id", candidateId)
        .eq("requirement", requirement);
      if (error) return error.message;
      setRows((cur) => cur.filter((r) => confirmationKey(r.candidate_id, r.requirement) !== confirmationKey(candidateId, requirement)));
      return null;
    },
    [supabase, mandateId]
  );

  return { map, save, clear };
}

type Vocab = "match" | "ai";

/** Replaces one check with the recruiter's confirmed answer, if there is one. */
export function overlayCheck<T extends { requirement: string; status: string; evidence: string | null; basis?: EvidenceBasis | null }>(
  check: T,
  candidateId: string,
  map: Map<string, Confirmation>,
  vocab: Vocab
): T {
  const conf = map.get(confirmationKey(candidateId, check.requirement));
  if (!conf) return check;
  return {
    ...check,
    status: conf.status === "met" ? "met" : vocab === "ai" ? "missing" : "not_met",
    basis: "confirmed",
    evidence: `Confirmed by ${conf.confirmed_by_name ?? "a recruiter"}${conf.note ? `: ${conf.note}` : ""}`,
  };
}

export function BasisTag({ basis }: { basis: EvidenceBasis | null | undefined }) {
  if (!basis) return null;
  const cls =
    basis === "confirmed"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
      : basis === "inferred"
        ? "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-200"
        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-px text-[10.5px] font-medium ${cls}`}>
      {basis === "confirmed" && <BadgeCheck className="h-3 w-3" />}
      {BASIS_LABEL[basis]}
    </span>
  );
}

// The detail panel under a requirement: where the verdict came from, the
// evidence, and the two buttons a recruiter uses after asking on the call.
export function ConfirmPanel({
  candidateId,
  requirement,
  evidence,
  basis,
  question,
  confirmations,
}: {
  candidateId: string;
  requirement: string;
  evidence: string | null;
  basis: EvidenceBasis | null | undefined;
  question?: string | null;
  confirmations: ReturnType<typeof useConfirmations>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else setNote("");
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[12px] dark:border-slate-700 dark:bg-slate-800/60">
      <p className="font-medium text-slate-800 dark:text-slate-100">{requirement}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <BasisTag basis={basis} />
        {evidence && <span className="text-slate-500 dark:text-slate-400">{evidence}</span>}
      </div>
      {question && <p className="mt-1 text-amber-800 dark:text-amber-300">Ask: {question}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note from the call (optional)"
          className="min-w-[10rem] flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          disabled={busy}
          onClick={() => run(() => confirmations.save(candidateId, requirement, "met", note))}
          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          <Check className="h-3 w-3" /> Has it
        </button>
        <button
          disabled={busy}
          onClick={() => run(() => confirmations.save(candidateId, requirement, "not_met", note))}
          className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-2 py-1 font-medium text-white hover:bg-rose-500 disabled:opacity-50"
        >
          <X className="h-3 w-3" /> Doesn&apos;t have it
        </button>
        {basis === "confirmed" && (
          <button disabled={busy} onClick={() => run(() => confirmations.clear(candidateId, requirement))} className="text-[11.5px] text-slate-500 underline hover:text-slate-700">
            Undo
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-rose-600">{error}</p>}
    </div>
  );
}
