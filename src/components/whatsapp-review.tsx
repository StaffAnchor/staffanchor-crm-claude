"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2, Mail, MessageCircle, X, Zap } from "lucide-react";

// Review before anything goes out from StaffAnchor's business number. It shows the exact message(s),
// lets the recruiter choose which details to ask for (so each candidate gets only what they lack), and
// sends only when they press the button. Nothing is sent by opening this.

export type ReviewPreview = {
  route: "chat" | "template" | "email";
  messages: string[];
  items: { key: string; label: string; selected: boolean; fixed?: boolean }[];
  note: string;
  recipients?: number;
};

type PreviewResult = { ok: true; preview: ReviewPreview } | { ok: false; error: string };
type SendResult = { ok: boolean; text: string };

const ROUTE_LABEL: Record<ReviewPreview["route"], string> = {
  chat: "WhatsApp chat message",
  template: "WhatsApp approved template",
  email: "Email",
};

export default function WhatsAppReview({
  title,
  recipient,
  loadPreview,
  send,
  onDone,
  onClose,
}: {
  title: string;
  recipient?: string | null;
  /** Fetch what would be sent. `only` is the ticked detail keys (when the preview has any). */
  loadPreview: (only?: string[]) => Promise<PreviewResult>;
  send: (only?: string[]) => Promise<SendResult>;
  onDone?: () => void;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<ReviewPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const picked = useRef<string[] | undefined>(undefined);

  const load = useCallback(
    async (only?: string[]) => {
      setLoading(true);
      setError(null);
      try {
        const r = await loadPreview(only);
        if (r.ok) setPreview(r.preview);
        else {
          setPreview(null);
          setError(r.error);
        }
      } catch {
        setError("Couldn't prepare the message. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [loadPreview]
  );

  useEffect(() => {
    void load(undefined);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(key: string) {
    if (!preview) return;
    const current = picked.current ?? preview.items.filter((i) => i.selected).map((i) => i.key);
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    picked.current = next;
    void load(next);
  }

  async function doSend() {
    setSending(true);
    try {
      const r = await send(picked.current);
      setResult(r);
      if (r.ok) onDone?.();
    } catch {
      setResult({ ok: false, text: "Network error. Nothing was sent." });
    } finally {
      setSending(false);
    }
  }

  const tickable = preview?.items.length ? preview.items : [];
  const nothingPicked = tickable.length > 0 && !tickable.some((i) => i.selected);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !sending && onClose()}>
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-label="Review before sending">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <div>
            <h3 className="text-[14px] font-semibold text-slate-900 dark:text-slate-100">Review before sending</h3>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {title}
              {recipient ? ` · ${recipient}` : ""}
            </p>
          </div>
          <button onClick={onClose} disabled={sending} aria-label="Close" className="text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {loading && !preview && (
            <p className="flex items-center gap-2 text-[13px] text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Preparing the message…
            </p>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}

          {preview && !result && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800">
                  <Zap className="h-3 w-3" /> Auto · sent from StaffAnchor&apos;s number
                </span>
                <span className="inline-flex items-center gap-1 text-slate-500">
                  {preview.route === "email" ? <Mail className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />} {ROUTE_LABEL[preview.route]}
                </span>
              </div>

              {tickable.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">Ask for</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tickable.map((i) => (
                      <label
                        key={i.key}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] ${
                          i.selected ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" : "border-slate-200 text-slate-500 dark:border-slate-700"
                        } ${i.fixed ? "opacity-70" : ""}`}
                        title={i.fixed ? "Always asked in the chat" : undefined}
                      >
                        <input type="checkbox" checked={i.selected} disabled={i.fixed || loading} onChange={() => toggle(i.key)} className="h-3 w-3" />
                        {i.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className={loading ? "opacity-60" : ""}>
                <p className="mb-1.5 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                  {preview.messages.length > 1 ? "The messages" : "The message"}
                  {preview.recipients && preview.recipients > 1 ? ` (example of ${preview.recipients})` : ""}
                </p>
                <div className="space-y-2">
                  {preview.messages.map((m, idx) => (
                    <div key={idx} className="rounded-xl rounded-tl-sm bg-[#dcf8c6] px-3 py-2 text-[13px] leading-5 text-slate-800 dark:bg-emerald-900/40 dark:text-slate-100">
                      <p className="whitespace-pre-wrap">{m}</p>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[12px] leading-5 text-slate-500">{preview.note}</p>
            </>
          )}

          {result && (
            <p className={`flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] ${result.ok ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" : "bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"}`}>
              {result.ok && <Check className="mt-0.5 h-4 w-4 shrink-0" />} {result.text}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          {result ? (
            <button onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white hover:bg-slate-700">
              Close
            </button>
          ) : (
            <>
              <button onClick={onClose} disabled={sending} className="rounded-lg px-3 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">
                Cancel
              </button>
              <button
                onClick={doSend}
                disabled={!preview || loading || sending || nothingPicked}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                {preview?.route === "email" ? "Send email" : "Send on WhatsApp"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
