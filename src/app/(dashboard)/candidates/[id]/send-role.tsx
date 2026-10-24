"use client";

import { useState } from "react";
import { Mail, MessageCircle, Send } from "lucide-react";

type Role = { id: string; role_title: string | null; client_name: string | null };

// The basic "tell this person about a role" action. Pick a role, see exactly what goes out, then send it on WhatsApp
// (Meta's approved template, the client is never named) or open an email. Nothing is sent until the second click.
export default function SendRole({ candidateId, candidateName, email, roles, channel, inline = false }: { candidateId: string; candidateName: string | null; email: string; roles: Role[]; channel?: "whatsapp" | "email"; inline?: boolean }) {
  const [open, setOpen] = useState(inline);
  const [mandateId, setMandateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ messages: string[]; note?: string; recipients: number; noPhone: number; optedOut: number; alreadySent: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const role = roles.find((r) => r.id === mandateId);
  const first = (candidateName ?? "").trim().split(/\s+/)[0] || "there";
  const hasEmail = !!email && !/\.invalid$/i.test(email);

  async function call(extra: Record<string, unknown>) {
    const res = await fetch("/api/whatsapp/role-opportunity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId, candidateIds: [candidateId], ...extra }) });
    return (await res.json().catch(() => ({}))) as Record<string, unknown>;
  }

  async function showPreview() {
    setBusy(true);
    setErr(null);
    setResult(null);
    setPreview(null);
    try {
      const j = await call({ preview: true });
      const p = j.preview as { messages?: string[]; note?: string; recipients?: number } | undefined;
      if (!p) setErr((j.error as string) ?? "Could not prepare the message.");
      else setPreview({ messages: p.messages ?? [], note: p.note, recipients: p.recipients ?? 0, noPhone: Number(j.noPhone ?? 0), optedOut: Number(j.optedOut ?? 0), alreadySent: Number(j.alreadySent ?? 0) });
    } catch {
      setErr("The connection dropped. Try again.");
    }
    setBusy(false);
  }

  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const j = await call({});
      if (Number(j.sent ?? 0) > 0) {
        setResult("Sent on WhatsApp.");
        setPreview(null);
      } else setErr((j.error as string) ?? "It did not go through.");
    } catch {
      setErr("The connection dropped. Check the WhatsApp tab before trying again.");
    }
    setBusy(false);
  }

  const mailto = role
    ? `mailto:${email}?subject=${encodeURIComponent(`An opportunity: ${role.role_title ?? "a sales role"}`)}&body=${encodeURIComponent(`Hi ${first},\n\nWe are hiring for a ${role.role_title ?? "sales"} role and your profile looks like a good fit. Would you be open to a quick chat about it?\n\nRegards`)}`
    : "#";

  return (
    <div className="w-full">
      {!inline && <button type="button" onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1.5 rounded-ros-md bg-teal-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700">
        <Send className="h-3.5 w-3.5" /> Send a role
      </button>}
      {open && (
        <div className={`${inline ? "" : "mt-3 "}rounded-ros-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40`}>
          <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300">Which role?</label>
          <select value={mandateId} onChange={(e) => { setMandateId(e.target.value); setPreview(null); setResult(null); setErr(null); }} className="mt-1 w-full max-w-md rounded-lg border border-slate-300 bg-white px-3 py-2 text-[13px] dark:border-slate-600 dark:bg-slate-900">
            <option value="">Choose an open role…</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.role_title} {r.client_name ? `· ${r.client_name}` : ""}
              </option>
            ))}
          </select>
          {mandateId && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {channel !== "email" && <button type="button" onClick={showPreview} disabled={busy} className="inline-flex items-center gap-1.5 rounded-ros-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                <MessageCircle className="h-3.5 w-3.5" /> {busy && !preview ? "Preparing…" : "WhatsApp: see the message"}
              </button>}
              {channel === "whatsapp" ? null : hasEmail ? (
                <a href={mailto} className="inline-flex items-center gap-1.5 rounded-ros-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
              ) : (
                <span className="text-[12px] text-slate-400">No email on file</span>
              )}
            </div>
          )}
          {preview && (
            <div className="mt-3 space-y-2">
              {preview.recipients > 0 ? (
                <>
                  {preview.messages.map((m, i) => (
                    <p key={i} className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-[13px] text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">{m}</p>
                  ))}
                  {preview.note && <p className="text-[12px] text-slate-500">{preview.note}</p>}
                  <button type="button" onClick={send} disabled={busy} className="rounded-ros-md bg-teal-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-teal-700 disabled:opacity-50">
                    {busy ? "Sending…" : "Send on WhatsApp"}
                  </button>
                </>
              ) : (
                <p className="text-[13px] text-amber-700 dark:text-amber-300">
                  Cannot send on WhatsApp: {preview.noPhone ? "no usable mobile number" : preview.optedOut ? "they opted out" : preview.alreadySent ? "this role was already sent in the last 30 days" : "not possible right now"}.
                </p>
              )}
            </div>
          )}
          {result && <p className="mt-3 text-[13px] font-medium text-emerald-700 dark:text-emerald-300">{result}</p>}
          {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
        </div>
      )}
    </div>
  );
}
