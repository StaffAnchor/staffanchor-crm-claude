"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useWhatsAppTemplates } from "@/lib/use-whatsapp-templates";

type Busy = "details" | "interview" | "offer" | "opportunity" | null;

const btn =
  "inline-flex items-center gap-1 rounded-ros-md bg-emerald-50 px-2 py-1 text-[11.5px] font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70";

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
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const askDetails = (missing?.length ?? 0) > 0;
  const interview = stage === "client_interview" && !!flags?.interview;
  const offer = stage === "offer" && !!flags?.offer;
  const opportunity = !!showOpportunity && !!flags?.opportunity;
  if (!askDetails && !interview && !offer && !opportunity) return null;

  async function post(kind: Exclude<Busy, null>) {
    if (busy) return;
    if (kind === "opportunity" && !window.confirm("Send this person a WhatsApp message about this role using the approved template? Meta charges per template message.")) return;
    setBusy(kind);
    setMsg(null);
    try {
      let res: Response;
      if (kind === "details") {
        res = await fetch("/api/whatsapp/ask-missing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId }) });
      } else if (kind === "opportunity") {
        res = await fetch("/api/whatsapp/role-opportunity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mandateId, candidateIds: [candidateId] }) });
      } else {
        res = await fetch("/api/whatsapp/stage-template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ candidateId, mandateId, kind }) });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) {
        setMsg({ ok: false, text: d.error ?? "That didn't work." });
      } else if (kind === "opportunity") {
        setMsg(d.sent > 0 ? { ok: true, text: "Sent on WhatsApp." } : { ok: false, text: d.alreadySent ? "Already sent in the last 30 days." : d.optedOut ? "They opted out." : d.noPhone ? "No mobile number." : (d.error ?? "Not sent.") });
      } else if (kind === "details") {
        setMsg({ ok: true, text: d.via === "email" ? "Window closed: emailed them a link." : d.via === "whatsapp_template" ? "Sent as a WhatsApp template." : "Asked in the WhatsApp chat." });
      } else {
        setMsg({ ok: true, text: "Sent on WhatsApp." });
      }
    } catch {
      setMsg({ ok: false, text: "Network error." });
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-1">
        {askDetails && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => post("details")} title="Ask for what the profile is missing">
            {busy === "details" && <Loader2 className="h-3 w-3 animate-spin" />} Ask details
          </button>
        )}
        {interview && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => post("interview")} title="Send the approved interview request template">
            {busy === "interview" && <Loader2 className="h-3 w-3 animate-spin" />} Interview request
          </button>
        )}
        {offer && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => post("offer")} title="Send the approved offer follow-up template">
            {busy === "offer" && <Loader2 className="h-3 w-3 animate-spin" />} Offer follow-up
          </button>
        )}
        {opportunity && (
          <button type="button" className={btn} disabled={!!busy} onClick={() => post("opportunity")} title="Tell them about this role with the approved template">
            {busy === "opportunity" && <Loader2 className="h-3 w-3 animate-spin" />} WhatsApp this role
          </button>
        )}
      </div>
      {msg && <span className={`text-[11px] ${msg.ok ? "text-emerald-700 dark:text-emerald-400" : "text-rose-600"}`}>{msg.text}</span>}
    </div>
  );
}
