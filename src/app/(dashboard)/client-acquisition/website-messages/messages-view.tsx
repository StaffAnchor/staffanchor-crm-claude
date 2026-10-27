"use client";

import { useState, useTransition } from "react";
import { Check, Mail, MessageCircle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatTile } from "@/components/ui/stat-tile";
import { setHandled } from "./actions";

export type WebsiteMessage = {
  id: string;
  created_at: string;
  site: string | null;
  kind: "contact" | "confirmed";
  message: string | null;
  intent: string | null;
  entities: { role?: string; city?: string; headcount?: number; experienceYears?: number; urgent?: boolean } | null;
  contact: string | null;
  handled_at: string | null;
};

const INTENT_LABEL: Record<string, string> = {
  employer: "Hiring",
  jobseeker: "Job seeker",
  referrer: "Referrer",
  vendor: "Agency",
  status: "Application status",
  privacy: "Privacy request",
  other: "Other",
};

const isEmail = (s: string) => /@/.test(s);
const digits = (s: string) => s.replace(/\D/g, "");
const waLink = (s: string) => {
  const d = digits(s);
  const full = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${full}`;
};

function Row({ r }: { r: WebsiteMessage }) {
  const [pending, start] = useTransition();
  const [handled, setH] = useState(!!r.handled_at);
  const e = r.entities ?? {};
  const bits = [e.headcount ? `${e.headcount}` : null, e.role ?? null, e.city ? `in ${e.city}` : null, e.experienceYears != null ? `${e.experienceYears} yrs` : null, e.urgent ? "urgent" : null].filter(Boolean);
  return (
    <tr className={`border-b border-slate-50 dark:border-slate-800/60 last:border-0 align-top ${handled ? "opacity-60" : ""}`}>
      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
        {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
      </td>
      <td className="px-4 py-3">
        <Badge tone={r.intent === "employer" ? "accent" : r.intent === "privacy" ? "warning" : "neutral"}>{INTENT_LABEL[r.intent ?? "other"] ?? r.intent}</Badge>
        {bits.length > 0 && <p className="mt-1 text-[12px] text-slate-500">{bits.join(", ")}</p>}
      </td>
      <td className="px-4 py-3 max-w-md">
        <p className="text-slate-800 dark:text-slate-200">{r.message ?? "—"}</p>
      </td>
      <td className="px-4 py-3">
        {r.contact ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-900 dark:text-slate-100">{r.contact}</span>
            <div className="flex gap-3 text-[12px]">
              {isEmail(r.contact) ? (
                <a href={`mailto:${r.contact}`} className="inline-flex items-center gap-1 text-teal-600 hover:underline">
                  <Mail className="h-3 w-3" /> Email
                </a>
              ) : (
                <a
                  href={waLink(r.contact)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Manual: opens WhatsApp in your browser or phone with an empty chat. You write and send the message yourself. Nothing is sent automatically."
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline"
                >
                  <MessageCircle className="h-3 w-3" /> WhatsApp (opens browser)
                </a>
              )}
            </div>
          </div>
        ) : (
          <span className="text-slate-400">No contact left</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setHandled(r.id, !handled);
              if (res.ok) setH(!handled);
            })
          }
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-[12px] hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
        >
          {handled ? (
            <>
              <RotateCcw className="h-3 w-3" /> Reopen
            </>
          ) : (
            <>
              <Check className="h-3 w-3" /> Mark handled
            </>
          )}
        </button>
      </td>
    </tr>
  );
}

export default function MessagesView({ rows }: { rows: WebsiteMessage[] }) {
  const withContact = rows.filter((r) => r.kind === "contact");
  const open = withContact.filter((r) => !r.handled_at).length;
  const taps = rows.filter((r) => r.kind === "confirmed");
  return (
    <div className="max-w-[1500px] mx-auto px-5 py-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Left contact details" value={withContact.length} />
        <StatTile label="Not handled yet" value={open} accent={open > 0} />
        <StatTile label="Hiring enquiries" value={withContact.filter((r) => r.intent === "employer").length} />
        <StatTile label="Tapped a next step" value={taps.length} />
      </div>

      <Card padded={false} className="overflow-x-auto">
        <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">Visitors who left an email or mobile number</p>
        <p className="px-4 pb-2 text-[12px] text-slate-500">From the message box on staffanchor.com, newest first. Hiring enquiries also arrive as an email to the info@ mailbox.</p>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">What they wrote</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {withContact.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  Nobody has left details yet.
                </td>
              </tr>
            )}
            {withContact.map((r) => (
              <Row key={r.id} r={r} />
            ))}
          </tbody>
        </table>
      </Card>

      {taps.length > 0 && (
        <Card padded={false} className="overflow-x-auto">
          <p className="px-4 pt-3 pb-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">Tapped the main next step, no details left</p>
          <p className="px-4 pb-2 text-[12px] text-slate-500">They went on to the form or WhatsApp. Useful for seeing what people ask for, not for follow-up.</p>
          <table className="w-full text-[13px]">
            <tbody>
              {taps.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
