"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, MessageCircle, Star, UserCheck } from "lucide-react";

type Preview = {
  email: { available: boolean; why: string | null; subject: string | null; text: string | null };
  whatsapp: { available: boolean; why: string | null; text: string | null };
};

const DAY = 86_400_000;

// Where this person stands for the top tier (sales profile, ready, confirmed open in the last 90 days) and the one step that
// moves them up. Shown on every sales profile so the move is never more than a click away. Nothing is sent until the
// person presses Send on a preview.
export default function TopTierStatus({
  candidateId,
  isSales,
  ready,
  openAt,
  notNowUntil,
  missingCount,
  nowMs,
}: {
  candidateId: string;
  isSales: boolean;
  ready: boolean;
  openAt: string | null;
  notNowUntil: string | null;
  missingCount: number;
  nowMs: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mode, setMode] = useState<"email" | "whatsapp" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (!isSales) return null;
  const openDays = openAt ? Math.floor((nowMs - new Date(openAt).getTime()) / DAY) : null;
  const openFresh = openDays !== null && openDays < 90;
  const resting = !!notNowUntil && new Date(notNowUntil).getTime() > nowMs;
  const top = ready && openFresh;

  async function call(action: string) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/top-tier`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const d = await res.json().catch(() => ({}));
      return { res, d };
    } finally {
      setBusy(false);
    }
  }

  async function openPreview(which: "email" | "whatsapp") {
    setMode(which);
    if (preview) return;
    const { d } = await call("preview");
    if (d.ok) setPreview(d as Preview);
    else setMessage({ ok: false, text: d.error ?? "Couldn't load the preview." });
  }

  async function run(action: "mark_open" | "email" | "whatsapp") {
    const { d } = await call(action);
    setMessage({ ok: !!d.ok, text: d.message ?? d.error ?? "That didn't work." });
    if (d.ok) {
      setMode(null);
      router.refresh();
    }
  }

  const chip = top
    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-200"
    : "border-amber-200 bg-amber-50/70 text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200";
  const btn = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium disabled:opacity-50";
  const active = mode ? preview?.[mode] : null;

  return (
    <div className={`mt-3 rounded-ros-lg border px-3.5 py-2.5 text-[12.5px] ${chip}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-1.5 font-semibold">
          <Star className={`h-3.5 w-3.5 ${top ? "fill-emerald-500 text-emerald-600" : "fill-amber-400 text-amber-500"}`} />
          {top ? "Top tier" : "Not top tier yet"}
        </span>
        <span className="min-w-0 flex-1">
          {top
            ? `Confirmed open to work ${openDays === 0 ? "today" : `${openDays} days ago`}. Put them first for any new role.`
            : resting
              ? "They said not right now. Leave them until that rest ends."
              : !ready
                ? `Details first${missingCount ? ` (${missingCount} missing)` : ""}, then confirm they are open to work.${openFresh ? " They have already said they are open." : ""}`
                : "Ready. One step left: confirm they are open to work."}
        </span>
        {!top && !resting && (
          <span className="flex flex-wrap items-center gap-1.5">
            {!ready && (
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent("profile-open-panel", { detail: { panel: "message", tab: "official" } }))} className={`${btn} border-amber-300 bg-white text-amber-900 hover:bg-amber-50`}>
                Ask for missing details
              </button>
            )}
            {!openFresh && (
              <>
                <button type="button" disabled={busy} onClick={() => run("mark_open")} className={`${btn} border-teal-600 bg-teal-600 text-white hover:bg-teal-700`} title="Use this after you have spoken to them and they said they are open">
                  <UserCheck className="h-3.5 w-3.5" /> They told me they are open
                </button>
                <button type="button" disabled={busy} onClick={() => openPreview("email")} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                  <Mail className="h-3.5 w-3.5" /> Ask by email
                </button>
                <button type="button" disabled={busy} onClick={() => openPreview("whatsapp")} className={`${btn} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                  <MessageCircle className="h-3.5 w-3.5" /> Ask on WhatsApp
                </button>
              </>
            )}
          </span>
        )}
      </div>

      {mode && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-white p-3 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {!preview ? (
            <p className="text-slate-500">Loading the preview…</p>
          ) : active && active.available ? (
            <>
              <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-slate-400">{mode === "email" ? "This email will go out" : "This WhatsApp will go out"}</p>
              {mode === "email" && preview.email.subject && <p className="mb-1 font-medium">{preview.email.subject}</p>}
              <p className="max-h-40 overflow-auto whitespace-pre-wrap text-slate-600 dark:text-slate-300">{active.text}</p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={busy} onClick={() => run(mode)} className="rounded-full bg-teal-600 px-4 py-1.5 text-[12.5px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                  {busy ? "Sending…" : "Send"}
                </button>
                <button type="button" onClick={() => setMode(null)} className="text-[12.5px] text-slate-500 hover:underline">
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">
              {active?.why ?? "Not available."}{" "}
              <button type="button" onClick={() => setMode(null)} className="text-teal-700 hover:underline dark:text-teal-300">
                Close
              </button>
            </p>
          )}
        </div>
      )}
      {message && (
        <p className={`mt-2 flex items-center gap-1.5 font-medium ${message.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
          {message.ok && <Check className="h-3.5 w-3.5" />} {message.text}
        </p>
      )}
    </div>
  );
}
