"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2 } from "lucide-react";

// The companies the owner rates. People who have worked at one score higher on the call list.
export default function TargetCompanies({ initial, canEdit }: { initial: string[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(initial.join("\n"));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const targets = text.split(/\n|,/).map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/talent-pool/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setMsg(d.error ?? "Couldn't save.");
      else {
        setMsg(`Saved ${d.count} companies.`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-ros-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 text-left text-[13px] font-semibold text-slate-800 dark:text-slate-100">
        <Building2 className="h-4 w-4 text-slate-500" /> Companies you rate
        <span className="font-normal text-slate-400">{initial.length > 0 ? `${initial.length} listed` : "none yet, add some to lift people who came from them"}</span>
        <span className="ml-auto text-[12px] font-medium text-teal-600">{open ? "Hide" : canEdit ? "Edit" : "View"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={!canEdit}
            rows={6}
            placeholder={"One company per line, e.g.\nFreshworks\nZoho\nSalesforce"}
            className="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] dark:border-slate-700 dark:bg-slate-900"
          />
          <p className="text-xs text-slate-500">Anyone who works or has worked at one of these gets a lift on the &quot;Speak to these next&quot; list. Matches ignore capitals and part-names, so &quot;Zoho&quot; also finds &quot;Zoho Corporation&quot;.</p>
          {canEdit ? (
            <div className="flex items-center gap-3">
              <button type="button" onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-slate-900">
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save
              </button>
              {msg && <span className="text-[12px] text-slate-600 dark:text-slate-300">{msg}</span>}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Only an admin can change this list.</p>
          )}
        </div>
      )}
    </div>
  );
}
