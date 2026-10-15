import { ExternalLink, Zap } from "lucide-react";

// Two very different things share the word "WhatsApp" in this app. These small pieces make the
// difference visible everywhere, in the same words:
//
//  - Auto: StaffAnchor's WhatsApp Business number sends an approved template by itself (Meta charges per message).
//  - Manual: opens WhatsApp Web in the browser with the text typed in; the person presses Send from their own WhatsApp.

export const AUTO_TEXT = "Sent automatically from StaffAnchor's WhatsApp Business number using a Meta-approved template. Meta charges per message.";
export const MANUAL_TEXT = "Opens WhatsApp Web in your browser with the message typed in. Nothing is sent until you press Send there, from your own WhatsApp.";

/** Chip for buttons that send by themselves. `purpose` says what the template is for. */
export function AutoChip({ purpose, className = "" }: { purpose: string; className?: string }) {
  return (
    <span
      title={`${AUTO_TEXT} Purpose: ${purpose}.`}
      className={`inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-800 ${className}`}
    >
      <Zap className="h-3 w-3" /> Auto · template: {purpose}
    </span>
  );
}

/** Chip for buttons that only open WhatsApp Web with a draft. */
export function ManualChip({ className = "" }: { className?: string }) {
  return (
    <span
      title={MANUAL_TEXT}
      className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 ${className}`}
    >
      <ExternalLink className="h-3 w-3" /> Manual · opens WhatsApp Web
    </span>
  );
}
