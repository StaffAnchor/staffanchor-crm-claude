"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// People is three places: Talent (everyone, with the top-tier strip), Profile completion (what is missing or weak, by group,
// practice and city, with the call lists and bulk asking to fix it) and Outreach (what was sent and how it went, and the campaigns). The rest sits under "More".
const TABS = [
  { href: "/candidates", label: "Talent" },
  { href: "/candidates/complete", label: "Profile completion" },
  { href: "/candidates/activity", label: "Outreach", also: ["/candidates/outreach"] },
];

// The second row shown inside Outreach.
const OUTREACH = [
  { href: "/candidates/activity", label: "Activity" },
  { href: "/candidates/outreach", label: "Campaigns" },
];

// Used rarely, so they stay out of the way.
const MORE = [
  { href: "/candidates/inventory", label: "Role and city map" },
  { href: "/saas-practice", label: "B2B SaaS talent pool" },
  { href: "/candidates/lists", label: "Saved shortlists" },
  { href: "/candidates/referrals", label: "Referrals" },
  { href: "/candidates/files", label: "CV files" },
  { href: "/candidates/duplicates", label: "Duplicates (admin)" },
];

export default function CandidatesSubNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/candidates" ? pathname === "/candidates" : pathname?.startsWith(href));
  const moreActive = MORE.some((m) => isActive(m.href));
  const tabActive = (t: (typeof TABS)[number]) => isActive(t.href) || (t.also ?? []).some((h) => isActive(h));
  const inOutreach = OUTREACH.some((o) => isActive(o.href));

  return (
    <>
    <div className={`flex flex-wrap items-center gap-1 -mt-1 ${inOutreach ? "mb-2" : "mb-4"}`}>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`px-3 py-1.5 rounded-full whitespace-nowrap text-[12.5px] font-medium transition-colors ${
            tabActive(t) ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
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
        <div className="absolute left-0 max-md:left-auto max-md:right-0 z-30 mt-1 w-64 max-w-[calc(100vw-1.5rem)] rounded-ros-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {MORE.map((m) => (
            <Link key={m.href} href={m.href} className="block px-3 py-2 text-[12.5px] text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
              {m.label}
            </Link>
          ))}
        </div>
      </details>
    </div>
    {inOutreach && (
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-100 pb-2 dark:border-slate-800">
        {OUTREACH.map((o) => (
          <Link
            key={o.href}
            href={o.href}
            className={`px-2.5 py-1 rounded-md whitespace-nowrap text-[12.5px] font-medium ${isActive(o.href) ? "bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200" : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"}`}
          >
            {o.label}
          </Link>
        ))}
      </div>
    )}
    </>
  );
}
