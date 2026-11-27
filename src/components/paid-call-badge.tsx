import { PhoneCall } from "lucide-react";
import type { PaidCall } from "@/lib/paid-calls";

const TONE: Record<PaidCall["state"], string> = {
  waiting: "bg-amber-500 text-white ring-amber-500",
  overdue: "bg-rose-600 text-white ring-rose-600",
  called: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700",
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

// compact: the symbol only (candidate list). Otherwise the symbol with what is owed (profile header).
export default function PaidCallBadge({ call, compact = false }: { call: PaidCall; compact?: boolean }) {
  const words =
    call.state === "called"
      ? "Paid call done"
      : call.state === "overdue"
        ? `Paid call overdue${call.due ? `, was due ${day(call.due)}` : ""}`
        : `Paid call${call.due ? `, call by ${day(call.due)}` : ""}`;
  const title = `Paid ₹199 for a recruiter call on ${call.role}. ${words}.`;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full font-semibold ring-1 ${compact ? "px-1.5 py-0.5 text-xs" : "px-2.5 py-0.5 text-[13px]"} ${TONE[call.state]}`} title={title} aria-label={title}>
      <PhoneCall className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {compact ? "₹" : words}
    </span>
  );
}
