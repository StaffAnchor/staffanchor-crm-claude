"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// "Send a reminder": opens the message for you to read and edit. Nothing goes until you press Send in the box.
export default function ReminderButton({ id, name, to: to0, message: message0, recent }: { id: string; name: string; to: string; message: string; recent: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(to0);
  const [msg, setMsg] = useState(message0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const input = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900";
  const lbl = "mb-1 block text-xs font-medium text-slate-500";

  async function send() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/admin/cv-briefs/${id}/reminder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to, message: msg }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error ?? "Couldn't send.");
    setSent(j.sentTo ?? to);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={() => { setOpen(true); setSent(null); }} className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700">{recent ? "Send another reminder" : "Send a reminder"}</button>
        {sent && <span className="text-[13px] text-emerald-700 dark:text-emerald-300">Reminder sent to {sent}</span>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[16px] font-semibold">Remind {name || "the candidate"}</h3>
            <p className="mt-1 text-xs text-slate-500">Sent from info@staffanchor.com with a copy to you. It goes only when you press Send, to the address below.</p>
            {recent && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">They were reminded in the last 24 hours. Another one so soon can feel pushy.</p>}
            <label className="mt-3 block"><span className={lbl}>To</span><input className={input} value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@email.com" /></label>
            <label className="mt-3 block"><span className={lbl}>Message (they see &quot;Hi {name.split(/\s+/)[0] || "there"},&quot; above it and your signature below)</span><textarea className={input} rows={9} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3.5 py-1.5 text-[13px] font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800">Cancel</button>
              <button onClick={send} disabled={busy || !to.trim() || msg.trim().length < 10} className="rounded-lg bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
