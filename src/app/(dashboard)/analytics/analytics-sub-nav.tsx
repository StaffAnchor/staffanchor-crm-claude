"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Wallet, Target, Users, TrendingUp } from "lucide-react";

const TABS = [
  { href: "/analytics/reports", label: "Reports", icon: BarChart3 },
  { href: "/analytics/billing", label: "Billing", icon: Wallet },
  { href: "/analytics/performance", label: "Performance", icon: TrendingUp },
  { href: "/analytics/targets", label: "FY Targets", icon: Target },
  // Placements itself lives outside /analytics (it's recruiter-visible,
  // not admin-only -- see (dashboard)/placements/page.tsx), but it's
  // exactly the kind of decision-making view an admin expects to find
  // from here too, so it's linked in as a tab even though the active-tab
  // highlight below will never match it.
  { href: "/placements", label: "Placements", icon: Users },
];

// Simple pathname-prefix match (not exact) so query params on Reports
// (?range=30 etc.) don't break the active-tab highlight.
export default function AnalyticsSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 -mb-px">
      {TABS.map((t) => {
        const active = t.href !== "/placements" && pathname?.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 rounded-t-lg border border-b-0 transition-colors duration-200 ease-ros ${
              active
                ? "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
