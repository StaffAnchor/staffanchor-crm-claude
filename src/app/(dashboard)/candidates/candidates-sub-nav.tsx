"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// People, kept to the places used every day: Talent (everyone, with the top-tier strip), Calls today (the one list for
// whoever is on the phones), Activity (who was contacted, how, and whether it worked) and Improve profiles (what is
// missing, asked in batches). The rest sits under "More".
const TABS = [
  { href: "/candidates", label: "Talent" },
  { href: "/candidates/calls", label: "Calls today" },
  { href: "/candidates/activity", label: "Activity" },
  { href: "/candidates/pipeline", label: "Improve profiles" },
];

// Used rarely, so they stay out of the way. Shortlists are really saved pools; the B2B SaaS practice view is the same
// people filtered by what they sell.
const MORE = [
  { href: "/candidates/outreach", label: "Email and WhatsApp campaigns" },
  { href: "/candidates/inventory", label: "Role and city map" },
  { href: "/saas-practice", label: "B2B SaaS practice view" },
  { href: "/candidates/lists", label: "Saved shortlists" },
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
