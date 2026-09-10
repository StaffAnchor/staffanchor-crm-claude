"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneCall, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { STAGE_COLOR, stageLabel } from "@/lib/mandate-stage";

type FlaggedCall = {
  id: string;
  candidate_id: string | null;
  candidate_name: string | null;
  mandate_id: string | null;
  mandate_role_title: string | null;
  mandate_client_name: string | null;
  detail: string | null;
  created_at: string;
  call_round: string | null;
  link_stage: string | null;
  candidate_category: string | null;
  candidate_sub_domain: string | null;
  candidate_current_job_title: string | null;
  candidate_current_employer: string | null;
  candidate_current_fixed_ctc: number | null;
  candidate_notice_period: string | null;
};

function roundLabel(round: string | null) {
  if (round === "2nd") return "2nd Round";
  if (round === "final") return "Final Round";
  return null;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// "Calls flagged for me" -- answers a gap in the flag-for-call feature
// (see mandates/[id]/flag-for-call-button.tsx): the task landed on My Desk,
// but nothing made it visible the moment it happened, so a recruiter had no
// reason to go check unless they happened to open the inbox. This gives it
// the same always-visible, always-current treatment as NotificationBell --
// same 30s poll, same header placement -- but scoped specifically to
// CANDIDATE_CALL_REQUEST tasks assigned to the current user, since "someone
// asked me to call this person" deserves its own identity in the header,
// not to be buried inside the generic notification stream (which is
// reserved for client-driven events -- interview times, shortlist
// feedback -- not internal teammate asks).
//
// Reuses get_my_inbox() (same RPC My Desk itself calls) rather than
// querying recruiter_inbox directly, so this always matches what My Desk
// shows -- no separate query to keep in sync, no risk of drifting from the
// task list's own open/snoozed filtering logic. That RPC also does the
// "pending only" filtering server-side: a call flagged before the
// candidate got rejected/pulled back off THIS mandate quietly drops out,
// so nobody's ever asked to call someone already disposed of.
//
// Each entry is deliberately rendered like a mini mandate-pipeline row
// (stage badge, category, CTC/notice, current role) -- same shared
// STAGE_COLOR/stageLabel the mandate Table view uses -- rather than the
// old bare name+note, so an admin/recruiter gets enough context to decide
// whether to make the call right from the header, without opening the
// mandate first.
export default function CallsFlaggedBell() {
  const router = useRouter();
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [calls, setCalls] = useState<FlaggedCall[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.rpc("get_my_inbox");
    const mine = ((data ?? []) as { task_type: string; recruiter_id: string | null }[])
      .filter((row) => row.task_type === "CANDIDATE_CALL_REQUEST" && row.recruiter_id === user.id)
      .map((row) => row as unknown as FlaggedCall);
    setCalls(mine);
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleOpen() {
    setOpen((v) => !v);
    if (!open) await load();
  }

  function handleClick(call: FlaggedCall) {
    setOpen(false);
    if (call.candidate_id && call.mandate_id) {
      // back=calls sends the candidate profile's "back" link to
      // /calls-flagged (this same list, full-page) instead of the
      // mandate -- see candidates/[id]/page.tsx.
      router.push(`/candidates/${call.candidate_id}?mandateId=${call.mandate_id}&back=calls`);
    } else if (call.mandate_id) {
      router.push(`/mandates/${call.mandate_id}`);
    }
  }

  async function markDone(e: React.MouseEvent, callId: string) {
    e.stopPropagation();
    setCalls((cur) => cur.filter((c) => c.id !== callId));
    await supabase.from("recruiter_inbox").update({ status: "done", resolved_at: new Date().toISOString() }).eq("id", callId);
  }

  return (
    <div className="relative">
      <button
        onClick={handleOpen}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="ros-focusable relative flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 dark:text-slate-400 hover:text-teal-700 dark:hover:text-white hover:bg-teal-50 dark:hover:bg-white/[0.08] transition-colors duration-200"
        title="Calls flagged for me"
        aria-label="Calls flagged for me"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <PhoneCall className="w-4 h-4" strokeWidth={2} />
        {calls.length > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-semibold text-white">
            {calls.length > 9 ? "9+" : calls.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="menu"
          className="ros-glass absolute right-0 mt-2 w-96 max-h-[28rem] overflow-y-auto rounded-ros-lg shadow-ros-xl border py-1 animate-fade-in z-40"
        >
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <p className="text-[12px] font-semibold text-slate-900 dark:text-slate-100">Calls flagged for me</p>
          </div>
          {!loaded ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">Loading…</p>
          ) : calls.length === 0 ? (
            <p className="px-3 py-6 text-center text-[12px] text-slate-400">Nothing flagged right now.</p>
          ) : (
            calls.map((c) => (
              <button
                key={c.id}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleClick(c)}
                className="block w-full text-left px-3 py-2.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <p className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200 truncate">{c.candidate_name ?? "Candidate"}</p>
                      {c.link_stage && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-medium ${STAGE_COLOR[c.link_stage] ?? "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"}`}
                        >
                          {stageLabel(c.link_stage)}
                        </span>
                      )}
                      {roundLabel(c.call_round) && (
                        <span className="shrink-0 text-[9.5px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded-full px-1.5 py-0.5">
                          {roundLabel(c.call_round)}
                        </span>
                      )}
                    </div>
                    {c.candidate_sub_domain && <p className="text-[10.5px] text-slate-400 mt-0.5">{c.candidate_sub_domain}</p>}
                    {(c.mandate_role_title || c.mandate_client_name) && (
                      <p className="text-[11px] font-medium text-blue-600 dark:text-blue-400 truncate mt-0.5">
                        {c.mandate_role_title}
                        {c.mandate_client_name ? ` — ${c.mandate_client_name}` : ""}
                      </p>
                    )}
                    {(c.candidate_current_job_title || c.candidate_current_employer) && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {c.candidate_current_job_title}
                        {c.candidate_current_job_title && c.candidate_current_employer ? " · " : ""}
                        {c.candidate_current_employer}
                      </p>
                    )}
                    {(c.candidate_current_fixed_ctc || c.candidate_notice_period) && (
                      <p className="text-[10.5px] text-slate-400 mt-0.5">
                        {c.candidate_current_fixed_ctc ? `₹${c.candidate_current_fixed_ctc}L` : null}
                        {c.candidate_current_fixed_ctc && c.candidate_notice_period ? " · " : ""}
                        {c.candidate_notice_period ? `Notice: ${c.candidate_notice_period}` : null}
                      </p>
                    )}
                    {c.detail && <p className="text-[11.5px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">{c.detail}</p>}
                    <p className="text-[10px] text-slate-400 mt-1">{timeAgo(c.created_at)}</p>
                  </div>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => markDone(e, c.id)}
                    title="Mark done"
                    className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </button>
            ))
          )}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false);
              router.push("/calls-flagged");
            }}
            className="block w-full text-center px-3 py-2 text-[11.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800"
          >
            View all as a table
          </button>
        </div>
      )}
    </div>
  );
}
