"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The Candidates area, kept to what is used every day. Inventory (what we hold, by role and city) comes first;
// the less frequent pages sit under "More". Talent board and Practice Pool were folded into the Inventory and the
// role matches on each mandate.
const TABS = [
  { href: "/candidates/pipeline", label: "Pipeline" },
  { href: "/candidates/inventory", label: "Inventory" },
  { href: "/candidates", label: "Candidates" },
  { href: "/saas-practice", label: "B2B SaaS" },
  { href: "/candidates/lists", label: "Shortlists" },
  { href: "/candidates/outreach", label: "Outreach" },
];

const MORE = [
  { href: "/candidates/referrals", label: "Referrals" },
  { href: "/candidates/files", label: "CV files" },
  { href: "/candidates/duplicates", label: "Duplicates (admin)" },
];

export default function CandidatesSubNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/candidates" ? pathname === "/candidates" : pathname?.startsWith(href));
  const moreActive = MORE.some((m) => isActive(m.href));

  return (
    <div className="flex items-center gap-1 mb-4 -mt-1">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
            isActive(t.href) ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
      <details className="relative">
        <summary
          className={`list-none cursor-pointer px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
            moreActive ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          }`}
        >
          More ▾
        </summary>
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-ros-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} className="block px-3 py-2 text-[12.5px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
              {m.label}
            </Link>
          ))}
        </div>
      </details>
    </div>
  );
}
