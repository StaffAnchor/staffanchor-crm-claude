"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";

// One reminder to people who were told about the role two or more days ago and have not answered. Shows the message first;
// nothing goes out until Send is pressed. Each person gets one reminder per role.
export default function RoleNudgeButton({ mandateId, count }: { mandateId: string; count: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<{ recipients: number; total: number; sample: string[]; noPhone: number; optedOut: number } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function call(preview: boolean) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/whatsapp/role-nudge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId, preview }) });
      return await res.json().catch(() => ({}));
    } finally {
      setBusy(false);
    }
  }

  async function show() {
    setOpen(true);
    if (info) return;
    const d = await call(true);
    if (d.ok && d.preview) setInfo({ ...d.preview, noPhone: d.noPhone ?? 0, optedOut: d.optedOut ?? 0 });
    else {
      setMsg({ ok: false, text: d.error ?? "Couldn't prepare the reminder." });
    }
  }

  async function send() {
    const d = await call(false);
    if (d.ok && d.sent > 0) {
      setMsg({ ok: true, text: `Reminder sent to ${d.sent} ${d.sent === 1 ? "person" : "people"}.${d.remaining ? ` ${d.remaining} more are waiting: press again.` : ""}` });
      setInfo(null);
      router.refresh();
    } else setMsg({ ok: false, text: d.error ?? d.message ?? "Nothing was sent." });
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button type="button" onClick={show} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-3 py-1 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200">
          <BellRing className="h-3 w-3" /> Remind {count}
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[12px] dark:border-slate-700 dark:bg-slate-900">
          {!info && !msg && <p className="text-slate-500">Preparing…</p>}
          {info && (
            <>
              <p className="font-medium text-slate-700 dark:text-slate-200">
                This goes to {info.recipients} {info.recipients === 1 ? "person" : "people"} as an approved WhatsApp template (Meta charges per message):
              </p>
              {info.sample.map((s, i) => (
                <p key={i} className="mt-1 rounded bg-slate-50 px-2 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{s}</p>
              ))}
              {(info.noPhone > 0 || info.optedOut > 0) && <p className="mt-1 text-slate-400">Skipped: {info.noPhone} without a usable number, {info.optedOut} who opted out.</p>}
              <div className="mt-2 flex items-center gap-2">
                <button type="button" disabled={busy || info.recipients === 0} onClick={send} className="rounded-full bg-teal-600 px-3 py-1 font-semibold text-white hover:bg-teal-700 disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
                <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:underline">Cancel</button>
              </div>
            </>
          )}
          {msg && <p className={`mt-1 font-medium ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</p>}
        </div>
      )}
    </div>
  );
}
