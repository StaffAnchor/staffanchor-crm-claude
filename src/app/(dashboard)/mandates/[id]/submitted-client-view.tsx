"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import RoleBoardView from "@/components/client-view/RoleBoardView";
import { ReadOnlyContext } from "@/components/client-view/readonly";
import type { RoleBoard } from "@/components/client-view/types";

// The mandate's Submitted tab: the people shared with the client, laid out exactly as the client sees them in their portal (same
// tabs, cards and chips), read only. It loads when the tab is first opened, not with the rest of the page.
export default function SubmittedClientView({ mandateId, clientName }: { mandateId: string; clientName: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [board, setBoard] = useState<RoleBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || started) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setStarted(true);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    void (async () => {
      const { data, error: err } = await createClient().rpc("staff_client_role_board", { p_mandate_id: mandateId });
      if (cancelled) return;
      if (err || !data) setError(err?.message ?? "Could not load the client view.");
      else setBoard(data as RoleBoard);
    })();
    return () => {
      cancelled = true;
    };
  }, [started, mandateId]);

  // Each CV link is made for the candidate it belongs to, through the CRM's own CV route.
  const getResumeUrl = useCallback(
    async (path: string) => {
      const c = board?.candidates.find((x) => x.resume_file_url === path);
      if (!c) return null;
      const res = await fetch(`/api/candidates/${c.candidate_id}/cv-url`);
      if (!res.ok) return null;
      return ((await res.json()) as { url?: string }).url ?? null;
    },
    [board]
  );

  return (
    <div ref={box} className="min-h-24">
      {error ? (
        <p className="text-[13px] text-rose-600">{error}</p>
      ) : !board ? (
        <p className="text-[13px] text-slate-400">{started ? "Loading the client view…" : ""}</p>
      ) : (
        <ReadOnlyContext.Provider value>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#faf8f4] text-slate-900 [color-scheme:light]">
            <p className="border-b border-[#ece7de] bg-[#f4efe6] px-5 py-2 text-[12px] text-slate-600">
              {`This is what ${clientName ?? "the client"} sees in their portal: the same tabs, cards and wording. It is read only here, because Shortlist, Interview and Pass are the client's own decisions.`}
            </p>
            <RoleBoardView board={board} onFeedback={async () => {}} getResumeUrl={getResumeUrl} />
          </div>
        </ReadOnlyContext.Provider>
      )}
    </div>
  );
}
