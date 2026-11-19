"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CallRecordForm, { type CallFormPerson } from "../../candidates/call-record-form";

// Said they are open to roles in the last 90 days (the same window the top tier uses).
const openFresh = (iso: unknown) => !!iso && Date.now() - new Date(String(iso)).getTime() < 90 * 86_400_000;

/** The call form for one person with no role attached yet (used on Matches). It saves through the same call route as everywhere else. */
export default function CandidateCallPanel({ candidateId, roleCluster = null, onDone }: { candidateId: string; roleCluster?: string | null; onDone?: () => void }) {
  const [candidate, setCandidate] = useState<Record<string, unknown> | null>(null);

  async function load() {
    const { data } = await createClient().from("candidates").select("*").eq("id", candidateId).single();
    setCandidate(data as Record<string, unknown> | null);
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await createClient().from("candidates").select("*").eq("id", candidateId).single();
      if (!cancelled) setCandidate(data as Record<string, unknown> | null);
    })();
    return () => {
      cancelled = true;
    };
  }, [candidateId]);

  if (!candidate) return <p className="text-[14px] text-slate-400">Loading…</p>;
  const seg = candidate.segment_data as { offer_in_hand?: unknown; offer_ctc?: unknown } | null;
  return (
    <CallRecordForm
      key={String(candidate.updated_at ?? "")}
      p={{
        ...(candidate as unknown as CallFormPerson),
        open_fresh: openFresh(candidate.open_to_work_at),
        offer_in_hand: typeof seg?.offer_in_hand === "boolean" ? seg.offer_in_hand : null,
        offer_ctc: Number(seg?.offer_ctc) || null,
      }}
      mode="profile"
      roleCluster={roleCluster}
      onDone={async () => {
        await load();
        onDone?.();
      }}
    />
  );
}
