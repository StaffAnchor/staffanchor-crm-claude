"use client";

import { useRouter } from "next/navigation";

export default function PortalHeader({ company, cohort, who, role }: { company: string; cohort: string; who: string; role: string }) {
  const router = useRouter();
  async function out() {
    await fetch("/api/lab/auth/logout", { method: "POST" });
    router.push("/lab");
    router.refresh();
  }
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-700">Sales Leaders Lab by StaffAnchor</p>
          <p className="text-sm text-slate-600 dark:text-slate-300">{company} · {cohort}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-slate-600 dark:text-slate-300">{who} <span className="text-xs text-slate-400">({role})</span></span>
          <button onClick={out} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300">Sign out</button>
        </div>
      </div>
    </header>
  );
}
