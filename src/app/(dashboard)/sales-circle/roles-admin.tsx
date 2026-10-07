"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Eye, X } from "lucide-react";
import MandateVisibilityControl from "./mandate-visibility-control";
import RoleCard from "@/components/sales-circle/role-card";
import { ctcBand, roleReadiness, slabPayout, type PayoutSlab, type RoleCardData } from "@/lib/sales-circle";

export type AdminRole = RoleCardData & {
  client_name: string | null;
  referral_visible: boolean;
  referral_reveal_company_to_trusted: boolean;
  status: string | null;
  is_archived: boolean;
};

type Filter = "all" | "live" | "hidden" | "needs";

export default function RolesAdmin({ roles, slabs }: { roles: AdminRole[]; slabs: PayoutSlab[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [asTrusted, setAsTrusted] = useState(false);

  const rows = useMemo(
    () =>
      roles.map((r) => ({ role: r, ready: roleReadiness({ ...r, cities: r.cities }), payout: slabPayout(r.budget_max ?? r.budget_min, slabs) })),
    [roles, slabs]
  );
  const counts = {
    all: rows.length,
    live: rows.filter((r) => r.role.referral_visible).length,
    hidden: rows.filter((r) => !r.role.referral_visible).length,
    needs: rows.filter((r) => !r.ready.ready).length,
  };
  const shown = rows
    .filter((r) => (filter === "live" ? r.role.referral_visible : filter === "hidden" ? !r.role.referral_visible : filter === "needs" ? !r.ready.ready : true))
    .sort((a, b) => Number(b.role.referral_visible) - Number(a.role.referral_visible));

  const previewing = rows.find((r) => r.role.id === previewId) ?? null;
  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: `All roles ${counts.all}` },
    { key: "live", label: `On the board ${counts.live}` },
    { key: "hidden", label: `Hidden ${counts.hidden}` },
    { key: "needs", label: `Needs details ${counts.needs}` },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
              filter === c.key ? "border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-900">
        {shown.map(({ role: r, ready, payout }) => (
          <div key={r.id} className="grid gap-3 px-4 py-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_auto] lg:items-center">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{r.role_title}</div>
              <div className="mt-0.5 truncate text-[12px] text-slate-500 dark:text-slate-400">
                {r.client_name ?? "—"} · {r.city ?? "No city"} · {ctcBand(r.budget_min, r.budget_max) ?? "No CTC yet"}
                {payout != null && <span className="font-medium text-emerald-700 dark:text-emerald-400"> · Pays ₹{payout.toLocaleString("en-IN")}</span>}
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${ready.ready ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${ready.percent}%` }} />
                </div>
                <span className="text-[11.5px] font-medium text-slate-500">{ready.percent}% complete</span>
                {ready.ready ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
              </div>
              {!ready.ready && (
                <p className="mt-1 text-[11.5px] text-amber-700 dark:text-amber-400">
                  Missing: {ready.missingCore.join(", ")}.{" "}
                  <Link href={`/mandates/${r.id}`} className="font-medium underline underline-offset-2">
                    Fill in
                  </Link>
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <button onClick={() => setPreviewId(r.id)} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800 dark:hover:text-slate-200">
                <Eye className="h-3.5 w-3.5" /> Preview as referrer
              </button>
              <MandateVisibilityControl
                mandateId={r.id}
                roleTitle={r.role_title}
                referralVisible={r.referral_visible}
                revealCompany={r.referral_reveal_company_to_trusted}
                referralSummary={r.referral_summary}
                missingCore={ready.missingCore}
              />
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="px-4 py-8 text-center text-[13px] text-slate-400">Nothing in this view.</p>}
      </div>

      {previewing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8" onMouseDown={(e) => e.target === e.currentTarget && setPreviewId(null)}>
          <div className="w-full max-w-3xl rounded-2xl bg-slate-50 p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">Exactly what a referrer sees</h3>
                <p className="text-[12px] text-slate-500">No client name unless a Trusted referrer is viewing a role marked &ldquo;Reveals to Trusted&rdquo;.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-200">
                  {[false, true].map((t) => (
                    <button key={String(t)} onClick={() => setAsTrusted(t)} className={`rounded-md px-3 py-1 text-[12px] font-medium ${asTrusted === t ? "bg-slate-900 text-white" : "text-slate-600"}`}>
                      {t ? "Trusted" : "Member"}
                    </button>
                  ))}
                </div>
                <button onClick={() => setPreviewId(null)} aria-label="Close" className="text-slate-400 hover:text-slate-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <RoleCard
              preview
              role={{
                ...previewing.role,
                payout_amount: previewing.payout,
                company_name: asTrusted && previewing.role.referral_reveal_company_to_trusted ? previewing.role.client_name : null,
              }}
            />
            {!previewing.ready.ready && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-800">
                Referrers will see &ldquo;To be confirmed&rdquo; for missing details. Still missing: {previewing.ready.missingCore.join(", ")}.
              </p>
            )}
            {previewing.ready.missingExtra.length > 0 && previewing.ready.ready && (
              <p className="mt-3 text-[12px] text-slate-500">Optional details not filled in yet: {previewing.ready.missingExtra.join(", ")}. Adding them makes the role clearer.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
