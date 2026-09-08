"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/candidates", label: "Candidates" },
  { href: "/candidates/referrals", label: "Referrals" },
  { href: "/practice-pool", label: "Practice Pool" },
];

// Referrals used to be its own top-level nav item; folded in here (Sep
// 2026) as a tab since it's the same underlying pool of people, just a
// different lens (who referred whom) -- only shown on the list-level pages
// (main list + Referrals), not the detail/new/groups/bulk-upload/search
// sub-routes, so it's rendered inline by those two pages rather than in
// the shared candidates/layout.tsx.
//
// Practice Pool (still at its own /practice-pool route, not nested under
// /candidates -- it has its own nav-independent history and a URL
// recruiters already have bookmarked) joined this tab strip the same way:
// same underlying candidates, cross-referenced against open mandates by
// practice instead of listed flat.
export default function CandidatesSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 mb-4 -mt-1">
      {TABS.map((t) => {
        const active = t.href === "/candidates" ? pathname === "/candidates" : pathname?.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ${
              active
                ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
