"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InterviewRow } from "./page";

function formatSlot(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function toDateInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function toTimeInput(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(11, 16);
}

export default function InterviewRowActions({ row }: { row: InterviewRow }) {
  const router = useRouter();
  const supabase = createClient();
  const [scheduling, setScheduling] = useState(false);
  const [loggingOutcome, setLoggingOutcome] = useState(false);
  const [date, setDate] = useState(toDateInput(row.confirmed_interview_at ?? row.requested_interview_at));
  const [time, setTime] = useState(toTimeInput(row.confirmed_interview_at ?? row.requested_interview_at));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmSlot() {
    if (!date || !time) return;
    setBusy(true);
    const iso = new Date(`${date}T${time}`).toISOString();
    await supabase.from("candidate_mandate_links").update({ confirmed_interview_at: iso }).eq("id", row.id);
    setBusy(false);
    setScheduling(false);
    router.refresh();
  }

  async function logOutcome(outcome: "offer" | "rejected") {
    setBusy(true);
    await supabase
      .from("candidate_mandate_links")
      .update({
        stage: outcome,
        stage_updated_at: new Date().toISOString(),
        rejection_reason: outcome === "rejected" ? reason || null : null,
      })
      .eq("id", row.id);
    setBusy(false);
    setLoggingOutcome(false);
    router.refresh();
  }

  const requestedLabel = formatSlot(row.requested_interview_at);
  const confirmedLabel = formatSlot(row.confirmed_interview_at);

  return (
    <div className="shrink-0 flex flex-col items-end gap-1.5">
      {confirmedLabel ? (
        <span className="text-[11.5px] font-medium text-slate-700">{confirmedLabel}</span>
      ) : requestedLabel ? (
        <span className="text-[11.5px] text-amber-600">Client proposed {requestedLabel}</span>
      ) : (
        <span className="text-[11.5px] text-slate-400">No time proposed yet</span>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            setScheduling((s) => !s);
            setLoggingOutcome(false);
          }}
          className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700"
        >
          {row.confirmed_interview_at ? "Reschedule" : "Confirm time"}
        </button>
        <button
          onClick={() => {
            setLoggingOutcome((s) => !s);
            setScheduling(false);
          }}
          className="text-[11.5px] font-medium text-slate-500 hover:text-slate-700"
        >
          Log outcome
        </button>
      </div>

      {scheduling && (
        <div className="flex items-center gap-1.5 mt-1 bg-slate-50 border border-slate-200 rounded-lg p-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-[11.5px] rounded border border-slate-300 px-1.5 py-1"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="text-[11.5px] rounded border border-slate-300 px-1.5 py-1"
          />
          <button
            onClick={confirmSlot}
            disabled={busy}
            className="text-[11.5px] font-medium bg-blue-600 text-white rounded px-2 py-1 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      )}

      {loggingOutcome && (
        <div className="flex flex-col gap-1.5 mt-1 bg-slate-50 border border-slate-200 rounded-lg p-2 w-56">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => logOutcome("offer")}
              disabled={busy}
              className="text-[11.5px] font-medium bg-lime-100 text-lime-800 rounded px-2 py-1 disabled:opacity-60"
            >
              Moved to offer
            </button>
            <button
              onClick={() => logOutcome("rejected")}
              disabled={busy}
              className="text-[11.5px] font-medium bg-red-100 text-red-700 rounded px-2 py-1 disabled:opacity-60"
            >
              Rejected
            </button>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (optional)"
            className="text-[11.5px] rounded border border-slate-300 px-1.5 py-1"
          />
        </div>
      )}
    </div>
  );
}
