"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";

export type SidebarItem = {
  label: string;
  href: string;
  icon?: LucideIcon;
  matchParam?: { key: string; value: string };
};

export type SidebarGroup = {
  heading: string;
  items: SidebarItem[];
};

export default function SectionShell({
  basePath,
  groups,
  children,
}: {
  basePath: string;
  groups: SidebarGroup[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);

  function isActive(item: SidebarItem) {
    if (!pathname.startsWith(basePath)) return false;
    if (!item.matchParam) {
      return !searchParams.get("status") && !searchParams.get("q");
    }
    return searchParams.get(item.matchParam.key) === item.matchParam.value;
  }

  return (
    <div className="max-w-[1400px] mx-auto flex">
      <aside
        className={`shrink-0 border-r border-slate-200 bg-white/60 transition-all duration-200 ${
          collapsed ? "w-0 overflow-hidden" : "w-56"
        }`}
      >
        <div className="py-5 px-3 sticky top-14">
          {groups.map((group) => (
            <div key={group.heading} className="mb-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 mb-1.5">
                {group.heading}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                        active
                          ? "bg-blue-50 text-blue-700 font-medium"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2} />}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <button
        onClick={() => setCollapsed((v) => !v)}
        className="hidden md:flex items-center justify-center w-4 h-8 my-auto -ml-2 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-700 shadow-sm z-10 sticky top-1/2"
        title={collapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      <div className="flex-1 min-w-0 px-6 py-6">{children}</div>
    </div>
  );
}
