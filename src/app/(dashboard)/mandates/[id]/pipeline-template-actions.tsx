"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useWhatsAppTemplates } from "@/lib/use-whatsapp-templates";
import WhatsAppReview from "@/components/whatsapp-review";

type Busy = "details" | "interview" | "offer" | "opportunity" | null;

const btn =
  "inline-flex items-center gap-1 rounded-ros-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70";

// One-click messages for a candidate on a role, sent through WhatsApp Business with the approved
// templates (when the window is closed) or in the open chat. Each button only appears when it applies:
// details when something is missing, the interview request at the interview stage, the offer follow-up at
// the offer stage, and the opportunity message where the role is being offered to someone.
export default function PipelineTemplateActions({
  candidateId,
  mandateId,
  stage,
  missing,
  showOpportunity,
}: {
  candidateId: string;
  mandateId: string;
  stage?: string | null;
  missing?: string[] | null;
  showOpportunity?: boolean;
}) {
  const flags = useWhatsAppTemplates();
  const router = useRouter();
  const [review, setReview] = useState<Busy>(null);

  const askDetails = (missing?.length ?? 0) > 0;
  const interview = stage === "client_interview" && !!flags?.interview;
  const offer = stage === "offer" && !!flags?.offer;
  const opportunity = !!showOpportunity && !!flags?.opportunity;

  // Every send goes through the review step: the exact message is shown, and only the button sends it.
  const REVIEW_TITLE: Record<Exclude<Busy, null>, string> = {
    details: "Ask for missing profile details",
    interview: "Interview request",
    offer: "Offer follow-up",
    opportunity: "Tell them about this role",
  };

  const call = useCallback(
    async (kind: Exclude<Busy, null>, extra: Record<string, unknown>) => {
      const post = (url: string, body: Record<string, unknown>) =>
        fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ res: r, d: await r.json().catch(() => ({})) }));
      if (kind === "details") return post("/api/whatsapp/ask-missing", { candidateId, ...extra });
      if (kind === "opportunity") return post("/api/whatsapp/role-opportunity", { mandateId, candidateIds: [candidateId], ...extra });
      return post("/api/whatsapp/stage-template", { candidateId, mandateId, kind, ...extra });
    },
    [candidateId, mandateId]
  );

  const loadPreview = useCallback(
    async (only?: string[]) => {
      if (!review) return { ok: false, error: "Nothing to preview." } as const;
      const { d } = await call(review, { preview: true, ...(review === "details" ? { only } : {}) });
      if (d.ok === false || !d.preview) return { ok: false, error: d.error ?? "Couldn't prepare the message." } as const;
      if (review === "opportunity" && (!d.preview.recipients || d.preview.recipients < 1)) {
        return { ok: false, error: d.alreadySent ? "Already sent in the last 30 days." : d.optedOut ? "They opted out of automatic messages." : d.noPhone ? "No usable mobile number." : "This person can't be messaged right now." } as const;
      }
      return { ok: true, preview: d.preview } as const;
    },
    [review, call]
  );

  const sendNow = useCallback(
    async (only?: string[]) => {
      if (!review) return { ok: false, text: "Nothing to send." };
      const { res, d } = await call(review, review === "details" ? { only } : {});
      if (!res.ok || d.ok === false) return { ok: false, text: d.error ?? "That didn't work. Nothing was sent." };
      if (review === "opportunity") {
        return d.sent > 0 ? { ok: true, text: "Sent on WhatsApp." } : { ok: false, text: d.alreadySent ? "Already sent in the last 30 days." : d.optedOut ? "They opted out." : d.noPhone ? "No mobile number." : (d.error ?? "Not sent.") };
      }
      if (review === "details") {
        return { ok: true, text: d.via === "email" ? "WhatsApp wasn't possible, so we emailed them a link." : d.via === "whatsapp_template" ? "Sent as the approved WhatsApp template." : "Asked in the WhatsApp chat." };
      }
      return { ok: true, text: "Sent on WhatsApp." };
    },
    [review, call]
  );

  if (!askDetails && !interview && !offer && !opportunity) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        {askDetails && (
          <button type="button" className={btn} onClick={() => setReview("details")} title="Automatic. Asks the candidate for the details missing from their profile: in the chat if the 24-hour window is open, otherwise with the approved profile-details template.">
            Review &amp; ask details
          </button>
        )}
        {interview && (
          <button type="button" className={btn} onClick={() => setReview("interview")} title="Automatic. Sends the approved interview-coordination template now, to ask the candidate to confirm interview availability.">
            Review interview request
          </button>
        )}
        {offer && (
          <button type="button" className={btn} onClick={() => setReview("offer")} title="Automatic. Sends the approved offer follow-up template now, to check where the candidate stands on the offer.">
            Review offer follow-up
          </button>
        )}
        {opportunity && (
          <button type="button" className={btn} onClick={() => setReview("opportunity")} title="Automatic. Sends the approved role-opportunity template now, to tell the candidate about this role and ask if they are interested.">
            Review &amp; WhatsApp this role
          </button>
        )}
      </div>
      {(askDetails || interview || offer || opportunity) && (
        <span className="text-xs leading-4 text-slate-400" title="Sent from StaffAnchor's WhatsApp number with an approved template, only after you review the message and press Send. Meta charges per message.">
          Auto · you review first
        </span>
      )}
      {review && (
        <WhatsAppReview
          title={REVIEW_TITLE[review]}
          loadPreview={loadPreview}
          send={sendNow}
          onDone={() => router.refresh()}
          onClose={() => setReview(null)}
        />
      )}
    </div>
  );
}
