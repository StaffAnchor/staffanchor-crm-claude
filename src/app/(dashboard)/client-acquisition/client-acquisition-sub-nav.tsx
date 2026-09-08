"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Handshake, Building2 } from "lucide-react";

const TABS = [
  { href: "/client-acquisition/sales", label: "Sales", icon: Handshake },
  { href: "/client-acquisition/employer-inquiries", label: "Employer Inquiries", icon: Building2 },
];

// Same pathname-prefix-match pattern as analytics-sub-nav.tsx -- Sales'
// own sub-routes (/client-acquisition/sales/[id], /outreach-log) should
// still highlight the Sales tab.
export default function ClientAcquisitionSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 -mb-px">
      {TABS.map((t) => {
        const active = pathname?.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors duration-200 ease-ros ${
              active
                ? "border-slate-900 dark:border-slate-100 text-slate-900 dark:text-slate-100"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
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
