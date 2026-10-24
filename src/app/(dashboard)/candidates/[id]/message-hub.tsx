"use client";

import { useEffect, useState, type ReactNode } from "react";
import WhatsAppMenu from "@/components/whatsapp-menu";
import WhatsAppShareModal from "@/components/whatsapp-share-modal";
import { candidateTemplates } from "@/lib/whatsapp-link";
import { useMyFirstName } from "@/lib/use-my-name";
import { createClient } from "@/lib/supabase/client";
import type { HubTab } from "./action-center";

// Every way to contact this person, in one place, three channels. The suggestion at the top comes from the to-do list,
// so the right channel is already open for the thing that is missing.
const TABS: { key: HubTab; label: string; note: string }[] = [
  { key: "email", label: "Email", note: "From the CRM. Free." },
  { key: "official", label: "Official WhatsApp", note: "Meta-approved templates from our business number. Meta charges per template; keep within Rs 1,500 a month." },
  { key: "browser", label: "My WhatsApp", note: "Opens your own WhatsApp Web with the text filled in. Free. You press send." },
];

function logActivity(candidateId: string, kind: "whatsapp" | "email") {
  const supabase = createClient();
  void (async () => {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("activities").insert({ actor_id: user?.id ?? null, entity_type: "candidate", entity_id: candidateId, kind });
  })();
}

export default function MessageHub({
  candidateId,
  candidateName,
  phone,
  email,
  missingKeys,
  suggestion,
  suggestedTab,
  emailSlot,
  officialSlot,
}: {
  candidateId: string;
  candidateName: string | null;
  phone?: string | null;
  email: string;
  missingKeys: string[];
  suggestion: string | null;
  suggestedTab: HubTab;
  emailSlot: ReactNode;
  officialSlot: ReactNode;
}) {
  const me = useMyFirstName();
  const [tab, setTab] = useState<HubTab>(suggestedTab);
  const [sharing, setSharing] = useState(false);
  const [ids] = useState(() => [candidateId]);
  useEffect(() => {
    const on = (e: Event) => setTab((e as CustomEvent<HubTab>).detail);
    window.addEventListener("profile-hub-tab", on);
    return () => window.removeEventListener("profile-hub-tab", on);
  }, []);
  const hasEmail = !!email && !/\.invalid$/i.test(email);
  const cur = TABS.find((t) => t.key === tab)!;
  return (
    <div>
      {suggestion && (
        <p className="mb-3 rounded-lg bg-teal-50 px-3 py-2 text-[13px] text-teal-900 dark:bg-teal-950/30 dark:text-teal-200">
          <b>Suggested:</b> {suggestion}
        </p>
      )}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${tab === t.key ? "border-teal-600 text-teal-700" : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="mt-2 mb-3 text-[12px] text-slate-500 dark:text-slate-400">{cur.note}</p>

      {tab === "email" && (
        <div className="space-y-3">
          {emailSlot}
          {hasEmail ? (
            <a href={`mailto:${email}`} onClick={() => logActivity(candidateId, "email")} className="inline-block rounded-ros-md border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              Write a free-form email
            </a>
          ) : (
            <p className="text-[13px] text-amber-700 dark:text-amber-300">No email on file. Use WhatsApp, or get the email first.</p>
          )}
        </div>
      )}
      {tab === "official" && <div className="space-y-3">{phone ? officialSlot : <p className="text-[13px] text-amber-700 dark:text-amber-300">No usable phone number, so nothing can go on WhatsApp.</p>}</div>}
      {tab === "browser" && (
        <div className="space-y-2">
          {phone ? (
            <WhatsAppMenu
              phone={phone}
              templates={candidateTemplates(candidateName, { me, candidateId, missing: missingKeys }).filter((t) => t.key !== "intro")}
              onIntroduce={() => setSharing(true)}
              onSend={() => logActivity(candidateId, "whatsapp")}
              className="inline-flex items-center gap-1.5 rounded-ros-md bg-emerald-600 px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-emerald-700"
            />
          ) : (
            <p className="text-[13px] text-amber-700 dark:text-amber-300">No usable phone number.</p>
          )}
          {sharing && <WhatsAppShareModal candidateIds={ids} onClose={() => setSharing(false)} />}
        </div>
      )}
    </div>
  );
}
