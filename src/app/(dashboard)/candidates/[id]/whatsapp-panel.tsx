"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

export type WhatsAppMessage = {
  id: string;
  direction: "inbound" | "outbound";
  body_preview: string | null;
  status: string | null;
  created_at: string;
};

// Conversation thread + AI-drafted reply for one candidate's WhatsApp
// history (whatsapp_messages table). Distinct from the "Send Update via
// WhatsApp" button in the Inbox, which fires a pre-approved template for a
// specific task type -- this is for replying inside an ongoing conversation,
// where a template doesn't fit and typing a reply from scratch is the only
// option today.
export default function WhatsAppPanel({
  candidateId,
  hasPhone,
  messages,
}: {
  candidateId: string;
  hasPhone: boolean;
  messages: WhatsAppMessage[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [wasAiDrafted, setWasAiDrafted] = useState(false);
  const [error, setError] = useState("");
  const [sentOk, setSentOk] = useState(false);

  async function handleDraftWithAi() {
    setDrafting(true);
    setError("");
    setSentOk(false);
    try {
      const res = await fetch("/api/whatsapp/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't draft a reply.");
      setDraft(data.draft);
      setWasAiDrafted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't draft a reply.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!draft.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/send-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, body: draft, wasAiDrafted }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error ?? "Couldn't send the message.");
      setDraft("");
      setWasAiDrafted(false);
      setSentOk(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the message.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="space-y-3 mb-5">
        {messages.length === 0 && (
          <EmptyState
            icon={<MessageCircle className="w-5 h-5 text-slate-400" />}
            title="No WhatsApp conversation yet"
            description="Messages sent or received on WhatsApp with this candidate will show up here."
            className="py-10"
          />
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[75%] rounded-ros-lg px-3 py-2 text-[13px] ${
                m.direction === "outbound"
                  ? "bg-emerald-50 text-slate-800 dark:bg-emerald-950/30 dark:text-slate-100"
                  : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body_preview ?? <span className="italic text-slate-400">(no text)</span>}</p>
              <p className="text-[10.5px] text-slate-400 mt-1">
                {new Date(m.created_at).toLocaleString()}
                {m.direction === "outbound" && m.status ? ` · ${m.status}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>

      {!hasPhone ? (
        <p className="text-[12px] text-slate-400">This candidate has no phone number on file, so a WhatsApp reply can't be sent.</p>
      ) : (
        <div className="rounded-ros-lg border border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">Reply</p>
            <button
              type="button"
              onClick={handleDraftWithAi}
              disabled={drafting || messages.length === 0}
              className="flex items-center gap-1.5 rounded-ros-md bg-blue-600 hover:bg-blue-700 text-white text-[11.5px] font-medium px-2.5 py-1 disabled:opacity-50 transition-colors duration-200 ease-ros"
              title={messages.length === 0 ? "No conversation history to draft from yet" : undefined}
            >
              <Sparkles className="w-3.5 h-3.5" /> {drafting ? "Drafting..." : "Draft with AI"}
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              // Any manual edit still counts as "used the AI draft" for
              // time-saved purposes -- reviewing + tweaking a good draft is
              // the whole point, not a disqualifier. Only a reply typed from
              // a totally blank box (never drafted) should not count, and
              // that case is simply wasAiDrafted staying false.
            }}
            rows={3}
            placeholder="Type a reply, or generate a draft with AI first..."
            className="w-full rounded-ros-md border border-slate-300 dark:border-slate-700 px-3 py-1.5 text-[13px] resize-y bg-white dark:bg-slate-900"
          />
          <div className="flex items-center justify-between mt-2">
            <div>
              {error && <p className="text-[11px] text-red-600">{error}</p>}
              {sentOk && !error && <p className="text-[11px] text-emerald-600">Sent.</p>}
            </div>
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
              className="rounded-ros-md bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-medium px-3 py-1.5 disabled:opacity-50 transition-colors duration-200 ease-ros"
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
