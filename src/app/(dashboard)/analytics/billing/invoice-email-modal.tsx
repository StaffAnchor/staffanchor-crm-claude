"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// Review-then-send: the draft comes from the server (To from the client's
// billing email or primary contact, CC fixed to the owner), everything is
// editable, and nothing leaves until "Send".

type Draft = {
  from: string;
  cc: string;
  to: string;
  toSource: string | null;
  contacts: { name: string | null; email: string }[];
  subject: string;
  body: string;
  fileName: string;
  number: string;
  emailedAt: string | null;
  emailedTo: string | null;
};

const INPUT = "w-full rounded-md border border-slate-300 dark:border-slate-700 bg-transparent px-2 py-1.5 text-[13px]";

export default function InvoiceEmailModal({
  trancheId,
  kind,
  reminder = false,
  onClose,
  onSent,
}: {
  trancheId: string;
  kind: "proforma" | "final";
  reminder?: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"send" | "test" | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/admin/tranches/${trancheId}/email-invoice?kind=${kind}${reminder ? "&reminder=1" : ""}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Couldn't prepare the email");
        return;
      }
      setDraft(json);
      setTo(json.to);
      setCc(json.cc);
      setSubject(json.subject);
      setBody(json.body);
    })();
  }, [trancheId, kind, reminder]);

  async function send(test: boolean) {
    if (!test && draft?.emailedAt && !confirm(reminder ? `A reminder already went out on ${new Date(draft.emailedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}. Send another?` : `This was already emailed to ${draft.emailedTo}. Send it again?`)) return;
    setBusy(test ? "test" : "send");
    setError(null);
    const res = await fetch(`/api/admin/tranches/${trancheId}/email-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, reminder, to, cc, subject, body, test }),
    });
    const json = await res.json().catch(() => ({ ok: false, error: "Send failed" }));
    setBusy(null);
    if (!json.ok) {
      setError(json.error ?? "Send failed");
      return;
    }
    if (test) {
      setDone(`Test sent to ${json.to.join(", ")}. It was sent through the ${json.sentVia} mailbox (asked to show ${json.from}).`);
      return;
    }
    setDone(`Sent to ${json.to.join(", ")}${json.cc.length ? ` (cc ${json.cc.join(", ")})` : ""}.`);
    onSent();
  }

  const docName = kind === "proforma" ? "Proforma Invoice" : "Tax Invoice";

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">{reminder ? "Payment reminder" : "Email"} {docName}{draft ? ` ${draft.number}` : ""}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 text-sm">✕</button>
        </div>

        {!draft && !error && <p className="p-5 text-[13px] text-slate-400">Preparing…</p>}
        {!draft && error && <p className="p-5 text-[13px] text-red-600">{error}</p>}

        {draft && (
          <div className="p-5 space-y-3">
            {draft.emailedAt && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {reminder ? "Last reminder sent" : "Already emailed"} on {new Date(draft.emailedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}{reminder ? "" : ` to ${draft.emailedTo}`}.
              </div>
            )}
            <Row label="From">
              <p className="text-[13px] text-slate-700 dark:text-slate-300 py-1.5">StaffAnchor &lt;{draft.from}&gt;</p>
            </Row>
            <Row label="To">
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" className={INPUT} />
              <p className="text-[11.5px] text-slate-400 mt-1">
                {draft.toSource ? `Picked from the ${draft.toSource}. ` : "No email on file for this client. "}
                Separate several addresses with commas, e.g. to add the finance team.
              </p>
              {draft.contacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {draft.contacts.map((c) => (
                    <button
                      key={c.email}
                      type="button"
                      onClick={() => setTo((t) => (t.toLowerCase().includes(c.email.toLowerCase()) ? t : t ? `${t}, ${c.email}` : c.email))}
                      className="text-[11.5px] rounded-full border border-slate-300 dark:border-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      + {c.name ? `${c.name} ` : ""}{c.email}
                    </button>
                  ))}
                </div>
              )}
            </Row>
            <Row label="CC">
              <input value={cc} onChange={(e) => setCc(e.target.value)} className={INPUT} />
            </Row>
            <Row label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className={INPUT} />
            </Row>
            <Row label="Message">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} className={INPUT} />
            </Row>
            <p className="text-[11.5px] text-slate-400">Attached: {draft.fileName}</p>

            {error && <p className="text-[12px] text-red-600">{error}</p>}
            {done && <p className="text-[12px] text-emerald-600">{done}</p>}

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => send(false)}
                disabled={busy !== null || !!done}
                className="rounded-md bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-[12.5px] font-medium px-3 py-1.5"
              >
                {busy === "send" ? "Sending…" : reminder ? "Send reminder" : "Send to client"}
              </button>
              <button
                onClick={() => send(true)}
                disabled={busy !== null}
                className="rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-[12.5px] font-medium px-3 py-1.5 disabled:opacity-50"
              >
                {busy === "test" ? "Sending…" : "Send test to me only"}
              </button>
              <button onClick={onClose} className="rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 text-[12.5px] font-medium px-3 py-1.5">
                {done ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
