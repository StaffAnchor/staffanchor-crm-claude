"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Calendar, Check, Clock } from "lucide-react";

type Slot = { id: string; startsAt: string; durationMinutes: number };

function formatSlot(iso: string) {
  const d = new Date(iso);
  return {
    day: d.toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "short" }),
    time: d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
  };
}

export default function SlotPicker({
  token,
  slots,
  alreadyConfirmedAt,
  clientName,
}: {
  token: string;
  slots: Slot[];
  alreadyConfirmedAt: string | null;
  clientName: string;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState("");
  const [confirmedAt, setConfirmedAt] = useState<string | null>(alreadyConfirmedAt);

  async function book() {
    if (!selectedId) return;
    setBooking(true);
    setError("");
    try {
      // Anon-key client, same as the page -- book_interview_slot() is a
      // SECURITY DEFINER RPC that re-validates the token server-side before
      // touching any table, so this never needs an authenticated session.
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data, error: err } = await supabase.rpc("book_interview_slot", {
        p_token: token,
        p_slot_id: selectedId,
      });
      if (err) throw err;
      setConfirmedAt(data as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book that slot. Please try again.");
    } finally {
      setBooking(false);
    }
  }

  if (confirmedAt) {
    const f = formatSlot(confirmedAt);
    return (
      <div className="bg-white border border-emerald-200 rounded-xl p-6 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
          <Check className="h-5 w-5" />
        </div>
        <p className="text-base font-semibold text-slate-900">You&apos;re confirmed</p>
        <p className="text-sm text-slate-600 mt-1">
          {f.day} at {f.time} with {clientName}
        </p>
        <p className="text-xs text-slate-400 mt-3">
          Changed your mind? You can re-open this link and pick a different available time until it expires.
        </p>
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 text-center">
        <p className="text-sm text-slate-600">
          No open time slots right now -- your StaffAnchor recruiter will reach out directly to schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-medium text-slate-500 mb-3">Pick a time that works for you:</p>
      <div className="space-y-2">
        {slots.map((s) => {
          const f = formatSlot(s.startsAt);
          const selected = selectedId === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedId(s.id)}
              className={`w-full flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                selected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Calendar className={`h-4 w-4 ${selected ? "text-blue-600" : "text-slate-400"}`} />
                <div>
                  <p className="text-sm font-medium text-slate-900">{f.day}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {f.time} · {s.durationMinutes} min
                  </p>
                </div>
              </div>
              {selected && <Check className="h-4 w-4 text-blue-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {error && <p className="text-xs text-red-600 mt-3">{error}</p>}

      <button
        onClick={book}
        disabled={!selectedId || booking}
        className="w-full mt-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 transition-colors"
      >
        {booking ? "Confirming…" : "Confirm this time"}
      </button>
    </div>
  );
}
