"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Globe, Check } from "lucide-react";

const payText = (min: number | null, max: number | null) => {
  if (!min && !max) return null;
  const lo = min ?? max;
  const hi = max ?? min;
  return lo === hi ? `₹${lo} LPA` : `₹${lo} to ${hi} LPA`;
};

// What candidates see before they apply, on the jobs site, in the job-description PDF and in JD emails: the name shown for the client
// (the real name, or a line like "A leading EdTech company") and whether the pay is shown. Both can be changed here at any time.
export default function PublicListingPanel({
  mandateId,
  initialShowClientName,
  initialPublicClientLabel,
  initialShowPay,
  budgetMin,
  budgetMax,
  clientName,
}: {
  mandateId: string;
  initialShowClientName: boolean;
  initialPublicClientLabel: string | null;
  initialShowPay: boolean;
  budgetMin: number | null;
  budgetMax: number | null;
  clientName: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [showClientName, setShowClientName] = useState(initialShowClientName);
  const [label, setLabel] = useState(initialPublicClientLabel ?? "");
  const [showPay, setShowPay] = useState(initialShowPay);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pay = payText(budgetMin, budgetMax);
  const dirty = showClientName !== initialShowClientName || (label || "") !== (initialPublicClientLabel ?? "") || showPay !== initialShowPay;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    const { error: err } = await supabase
      .from("mandates")
      .update({ show_client_name: showClientName, public_client_label: showClientName ? null : label.trim() || null, show_pay_on_listing: showPay })
      .eq("id", mandateId);
    setSaving(false);
    if (err) return setError(`Couldn't save: ${err.message}`);
    setSaved(true);
    router.refresh();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
        <Globe className="h-3.5 w-3.5 text-slate-400" /> How this role is listed publicly
      </h2>
      <p className="mb-3 text-[13px] text-slate-400">What candidates see on jobs.staffanchor.com before they apply, and in the JD PDF and JD emails. You can change both whenever you like.</p>

      <p className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">Company line</p>
      <label className="mb-2 flex items-start gap-2 text-[14px] text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={!showClientName} onChange={(e) => setShowClientName(!e.target.checked)} className="mt-0.5" />
        Hide the client name (&quot;{clientName}&quot;) and show a line instead
      </label>
      {!showClientName && (
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder='e.g. "A leading Internet company"' className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[14px] dark:border-slate-600 dark:bg-slate-900" />
      )}
      <p className="mb-4 text-xs text-slate-400">
        Candidates see: <span className="font-medium text-slate-600 dark:text-slate-300">{showClientName ? clientName : label || "A confidential client"}</span>
      </p>

      <p className="mb-1 text-[13px] font-medium text-slate-700 dark:text-slate-200">Pay</p>
      <label className="mb-1 flex items-start gap-2 text-[14px] text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={showPay} onChange={(e) => setShowPay(e.target.checked)} className="mt-0.5" />
        Show the pay on the public listing
      </label>
      <p className="mb-4 text-xs text-slate-400">
        {pay ? (
          <>Candidates see: <span className="font-medium text-slate-600 dark:text-slate-300">{showPay ? pay : "no pay shown"}</span>. The budget stays on the role for matching either way.</>
        ) : (
          <>No pay is set on this role, so none is shown. Add it under Edit mandate details.</>
        )}{" "}
        Pay written in the job description text (Compensation and Benefits) is shown as written: edit it in the job description box on this page.
      </p>

      {error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
      <button onClick={handleSave} disabled={saving || !dirty} className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 py-2 text-[14px] font-medium text-white hover:bg-slate-800 disabled:opacity-50">
        {saved ? (<><Check className="h-3.5 w-3.5" /> Saved</>) : saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}
