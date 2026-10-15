"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, MessageCircle } from "lucide-react";
import { AutoChip } from "@/components/whatsapp-mode";
import WhatsAppReview from "@/components/whatsapp-review";

// Shows what a profile is missing and lets a recruiter ask the candidate for just those details:
// in the WhatsApp chat if the free-message window is open, by email otherwise.
export default function AskMissingDetails({ candidateId, missing }: { candidateId: string; missing: string[] }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const loadPreview = useCallback(
    async (only?: string[]) => {
      const res = await fetch("/api/whatsapp/ask-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, preview: true, only }),
      });
      const data = await res.json().catch(() => ({}));
      return data.ok ? ({ ok: true, preview: data.preview } as const) : ({ ok: false, error: data.error ?? "Couldn't prepare the message." } as const);
    },
    [candidateId]
  );

  const sendNow = useCallback(
    async (only?: string[]) => {
      const res = await fetch("/api/whatsapp/ask-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, only }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) return { ok: false, text: data.error ?? "Something went wrong. Nothing was sent." };
      const text =
        data.via === "whatsapp"
          ? "Sent on WhatsApp. Their answers will fill in the profile."
          : data.via === "whatsapp_template"
          ? "Sent as the approved WhatsApp template."
          : "WhatsApp wasn't possible, so we emailed them a link.";
      setNote(text);
      setState("done");
      return { ok: true, text };
    },
    [candidateId]
  );

  if (missing.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
        <AlertTriangle className="h-3 w-3" /> Missing: {missing.join(", ")}
      </span>
      {state === "done" ? (
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
          <Check className="h-3 w-3" /> {note}
        </span>
      ) : (
        <>
          <button
            onClick={() => setReviewing(true)}
            disabled={state === "loading"}
            title="Automatic: StaffAnchor's WhatsApp asks them in the chat if their 24-hour window is open, or sends the approved profile-details template if it is closed (Meta charges per template). If there is no WhatsApp route it emails them a link."
            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {state === "loading" ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />} Review &amp; ask for missing details
          </button>
          <AutoChip purpose="ask for missing profile details" />
        </>
      )}
      {error && <span className="text-rose-600">{error}</span>}
      {reviewing && (
        <WhatsAppReview
          title="Ask for missing profile details"
          loadPreview={loadPreview}
          send={sendNow}
          onDone={() => router.refresh()}
          onClose={() => setReviewing(false)}
        />
      )}
    </div>
  );
}
