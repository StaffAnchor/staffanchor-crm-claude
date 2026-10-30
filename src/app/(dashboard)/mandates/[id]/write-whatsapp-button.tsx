"use client";

import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import WhatsAppComposer from "@/components/whatsapp-composer";
import { whatsappLink } from "@/lib/whatsapp-link";

// "Write a message" on a suggested candidate: the phone number is only fetched when the button is pressed, so the long
// match lists stay light. Opens the same write-it-yourself window with the AI polish, then WhatsApp Web.
export default function WriteWhatsAppButton({ candidateId, name, role }: { candidateId: string; name: string; role?: string | null }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setErr(null);
    const { data } = await createClient().from("candidates").select("phone").eq("id", candidateId).maybeSingle();
    setBusy(false);
    const p = (data as { phone: string | null } | null)?.phone ?? null;
    if (!p || !whatsappLink(p, "x")) setErr("No usable mobile number.");
    else setPhone(p);
  }

  return (
    <>
      <button type="button" onClick={open} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-ros-md px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-60 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800" title="Write your own WhatsApp message, polish it with AI, then open it in WhatsApp">
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />} Write a message
      </button>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      {phone && <WhatsAppComposer phone={phone} name={name} role={role} onClose={() => setPhone(null)} />}
    </>
  );
}
