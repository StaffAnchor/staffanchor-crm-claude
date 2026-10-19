"use client";

import { Phone } from "lucide-react";
import { startCall } from "@/lib/calls";

// One Call button for the whole CRM. It opens the phone's dialer and remembers the call, so the CRM can ask how it went.
export default function CallButton({
  candidateId,
  mandateId,
  phone,
  label = "Call",
  className = "",
  onStarted,
  source,
}: {
  candidateId: string;
  mandateId?: string | null;
  phone: string | null | undefined;
  label?: string;
  className?: string;
  onStarted?: () => void;
  source?: string;
}) {
  if (!phone) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onStarted?.();
        void startCall({ candidateId, mandateId, phone, source });
      }}
      className={className || "inline-flex items-center gap-1.5 rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"}
    >
      <Phone className="h-4 w-4" /> {label}
    </button>
  );
}
