"use client";

import { useState, type ReactNode } from "react";
import InvoiceImportView from "./invoice-import-view";

// Two views sharing the Billing page: the live fee-tranche pipeline
// (generated automatically at placement) and historical invoices backfilled
// from PDFs issued before this CRM existed. Kept as tabs on one page rather
// than a separate route since both answer the same underlying question --
// "what has this firm billed" -- just from two different data sources.
export default function BillingTabs({ liveTranches }: { liveTranches: ReactNode }) {
  const [tab, setTab] = useState<"live" | "historical">("live");

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        {([
          { key: "live", label: "Live tranches" },
          { key: "historical", label: "Historical invoices" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
              tab === t.key
                ? "bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "live" ? liveTranches : <InvoiceImportView />}
    </div>
  );
}
