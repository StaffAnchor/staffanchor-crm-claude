"use client";

import { Phone, Mail, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Wraps the header's Call / WhatsApp / Email links so each click also
// fire-and-forgets a row into `activities` -- the same table the Activity
// tab reads from. This is the single highest-leverage place to capture
// outreach: it's the button recruiters already click for every real
// contact attempt, so logging happens with zero added friction and zero
// chance of being skipped.
function logActivity(candidateId: string, kind: "call" | "whatsapp" | "email") {
  const supabase = createClient();
  void (async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase.from("activities").insert({
      actor_id: user?.id ?? null,
      entity_type: "candidate",
      entity_id: candidateId,
      kind,
    });
  })();
}

const linkClass =
  "flex items-center gap-1.5 text-[12px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-ros-md px-3 py-1.5 transition-all duration-200 ease-ros hover:-translate-y-px active:translate-y-0 active:scale-[0.98]";

export default function QuickContactActions({
  candidateId,
  phone,
  email,
}: {
  candidateId: string;
  phone?: string | null;
  email: string;
}) {
  return (
    <>
      {phone && (
        <a href={`tel:${phone}`} className={linkClass} onClick={() => logActivity(candidateId, "call")}>
          <Phone className="w-3 h-3" /> Call
        </a>
      )}
      {phone && (
        <a
          href={`https://wa.me/91${phone.replace(/\D/g, "").slice(-10)}`}
          target="_blank"
          rel="noreferrer"
          className={linkClass}
          onClick={() => logActivity(candidateId, "whatsapp")}
        >
          <MessageCircle className="w-3 h-3" /> WhatsApp
        </a>
      )}
      <a href={`mailto:${email}`} className={linkClass} onClick={() => logActivity(candidateId, "email")}>
        <Mail className="w-3 h-3" /> Email
      </a>
    </>
  );
}
