"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MandateVisibilityControl({
  mandateId,
  referralVisible,
  revealCompany,
}: {
  mandateId: string;
  referralVisible: boolean;
  revealCompany: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function update(patch: { referralVisible?: boolean; revealCompany?: boolean }) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/sales-circle/mandates/${mandateId}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        disabled={busy}
        onClick={() => update({ referralVisible: !referralVisible })}
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
          referralVisible ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {referralVisible ? "On board" : "Hidden"}
      </button>
      {referralVisible && (
        <button
          disabled={busy}
          onClick={() => update({ revealCompany: !revealCompany })}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            revealCompany ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {revealCompany ? "Reveals to Trusted" : "Company hidden"}
        </button>
      )}
    </div>
  );
}
