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

  // Feature 5: instead of the recruiter typing a single guessed time and
  // going back-and-forth, offer a few candidate time slots and let the
  // candidate pick one themselves via a no-login link (same pattern as the
  // client shortlist link). Purely additive -- "Confirm time" above still
  // works for a recruiter who'd rather just set the time directly.
  const [sendingLink, setSendingLink] = useState(false);
  const [slotInputs, setSlotInputs] = useState<{ date: string; time: string }[]>([{ date: "", time: "" }]);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [copied, setCopied] = useState(false);

  function updateSlotInput(i: number, field: "date" | "time", value: string) {
    setSlotInputs((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  async function generateSchedulingLink() {
    const valid = slotInputs.filter((s) => s.date && s.time);
    if (valid.length === 0) {
      setLinkError("Add at least one candidate time slot.");
      return;
    }
    setGenerating(true);
    setLinkError("");
    try {
      const { error: slotsErr } = await supabase.from("interview_slots").insert(
        valid.map((s) => ({
          link_id: row.id,
          starts_at: new Date(`${s.date}T${s.time}`).toISOString(),
          duration_minutes: 30,
        }))
      );
      if (slotsErr) throw slotsErr;

      const token = crypto.randomUUID().replace(/-/g, "");
      const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { error: tokenErr } = await supabase
        .from("interview_scheduling_tokens")
        .insert({ token, link_id: row.id, expires_at: expiresAt });
      if (tokenErr) throw tokenErr;

      setGeneratedUrl(`${window.location.origin}/schedule/${token}`);
    } catch (err) {
      setLinkError(err instanceof Error ? err.message : "Could not create the scheduling link.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink() {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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
        <span className="text-[11.5px] font-medium text-slate-700 dark:text-slate-300">{confirmedLabel}</span>
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
            setSendingLink(false);
          }}
          className="text-[11.5px] font-medium text-blue-600 hover:text-blue-700 transition-colors duration-200 ease-ros"
        >
          {row.confirmed_interview_at ? "Reschedule" : "Confirm time"}
        </button>
        <button
          onClick={() => {
            setSendingLink((s) => !s);
            setScheduling(false);
            setLoggingOutcome(false);
          }}
          className="text-[11.5px] font-medium text-purple-600 hover:text-purple-700 transition-colors duration-200 ease-ros"
        >
          Let candidate pick
        </button>
        <button
          onClick={() => {
            setLoggingOutcome((s) => !s);
            setScheduling(false);
            setSendingLink(false);
          }}
          className="text-[11.5px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors duration-200 ease-ros"
        >
          Log outcome
        </button>
      </div>

      {sendingLink && (
        <div className="flex flex-col gap-1.5 mt-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-ros-md p-2 w-64">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Offer a few times -- the candidate picks one via a no-login link.
          </p>
          {slotInputs.map((s, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                type="date"
                value={s.date}
                onChange={(e) => updateSlotInput(i, "date", e.target.value)}
                className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1 flex-1"
              />
              <input
                type="time"
                value={s.time}
                onChange={(e) => updateSlotInput(i, "time", e.target.value)}
                className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1"
              />
              {slotInputs.length > 1 && (
                <button
                  onClick={() => setSlotInputs((prev) => prev.filter((_, idx) => idx !== i))}
                  className="text-slate-400 hover:text-red-500 text-[11px]"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setSlotInputs((prev) => [...prev, { date: "", time: "" }])}
            className="self-start text-[11px] text-purple-600 hover:text-purple-700"
          >
            + Add another time
          </button>
          {linkError && <p className="text-[11px] text-red-600">{linkError}</p>}
          {!generatedUrl ? (
            <button
              onClick={generateSchedulingLink}
              disabled={generating}
              className="text-[11.5px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-ros-md px-2 py-1 disabled:opacity-60 transition-all duration-200 ease-ros"
            >
              {generating ? "Creating link…" : "Create scheduling link"}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                readOnly
                value={generatedUrl}
                onFocus={(e) => e.currentTarget.select()}
                className="text-[11px] flex-1 rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1 bg-white dark:bg-slate-900"
              />
              <button
                onClick={copyLink}
                className="text-[11px] font-medium bg-purple-600 hover:bg-purple-500 text-white rounded-ros-md px-2 py-1 transition-all duration-200 ease-ros"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </div>
      )}

      {scheduling && (
        <div className="flex items-center gap-1.5 mt-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-ros-md p-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1"
          />
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1"
          />
          <button
            onClick={confirmSlot}
            disabled={busy}
            className="text-[11.5px] font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-ros-md px-2 py-1 disabled:opacity-60 transition-all duration-200 ease-ros"
          >
            Save
          </button>
        </div>
      )}

      {loggingOutcome && (
        <div className="flex flex-col gap-1.5 mt-1 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-ros-md p-2 w-56">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => logOutcome("offer")}
              disabled={busy}
              className="text-[11.5px] font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-ros-md px-2 py-1 disabled:opacity-60 transition-all duration-200 ease-ros"
            >
              Moved to offer
            </button>
            <button
              onClick={() => logOutcome("rejected")}
              disabled={busy}
              className="text-[11.5px] font-medium bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-ros-md px-2 py-1 disabled:opacity-60 transition-all duration-200 ease-ros"
            >
              Rejected
            </button>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Rejection reason (optional)"
            className="text-[11.5px] rounded-ros-md border border-slate-200 dark:border-slate-700 px-1.5 py-1"
          />
        </div>
      )}
    </div>
  );
}
