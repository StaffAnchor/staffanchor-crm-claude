"use client";

import { CAMPAIGN_TEMPLATES } from "@/lib/whatsapp-template-text";

export type Channel = "whatsapp" | "email";

export function ChannelToggle({ value, onChange }: { value: Channel; onChange: (c: Channel) => void }) {
  return (
    <div role="tablist" aria-label="Send by" className="inline-flex rounded-full border border-slate-200 p-0.5 text-[13px] dark:border-slate-700">
      {(["whatsapp", "email"] as const).map((c) => (
        <button
          key={c}
          role="tab"
          aria-selected={value === c}
          type="button"
          onClick={() => onChange(c)}
          className={`rounded-full px-3.5 py-1 font-medium ${value === c ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:text-slate-800 dark:text-slate-400"}`}
        >
          {c === "whatsapp" ? "WhatsApp" : "Email"}
        </button>
      ))}
    </div>
  );
}

/** Shown when the WhatsApp template for a campaign has not been created and approved yet: exactly what to submit to Meta. */
export function TemplateSetup({ which }: { which: keyof typeof CAMPAIGN_TEMPLATES }) {
  const t = CAMPAIGN_TEMPLATES[which];
  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
      <p className="font-semibold">This WhatsApp message needs a template approved by Meta first.</p>
      <p className="mt-1">In WhatsApp Manager, create this template, wait for approval, then set its name in the setting <code className="rounded bg-white/60 px-1">{t.envVar}</code>. Until then, use Email.</p>
      <dl className="mt-3 space-y-1.5">
        <div><dt className="inline font-semibold">Suggested name: </dt><dd className="inline">{t.suggestedName}</dd></div>
        <div><dt className="inline font-semibold">Category: </dt><dd className="inline">{t.category}</dd></div>
        <div><dt className="inline font-semibold">Body: </dt><dd className="inline whitespace-pre-wrap">{t.body}</dd></div>
        <div><dt className="inline font-semibold">Variables: </dt><dd className="inline">{t.variables}</dd></div>
        <div><dt className="inline font-semibold">Buttons: </dt><dd className="inline">{t.buttons}</dd></div>
      </dl>
    </div>
  );
}

export function WhatsAppSample({ text }: { text: string }) {
  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">The message they receive, from StaffAnchor&apos;s WhatsApp number</p>
      <div className="max-w-sm rounded-xl rounded-tl-sm bg-[#dcf8c6] px-3 py-2 text-[13px] leading-5 text-slate-800 dark:bg-emerald-900/40 dark:text-slate-100">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}
