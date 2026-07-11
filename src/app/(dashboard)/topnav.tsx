"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Search, Plus, Bell, ChevronDown } from "lucide-react";
import SignOutButton from "./sign-out-button";

type NavLink = { href: string; label: string; enabled: boolean };

export default function TopNav({
  navLinks,
  fullName,
  email,
  role,
  initials,
}: {
  navLinks: NavLink[];
  fullName: string | null;
  email: string;
  role: string;
  initials: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && search.trim()) {
      router.push(`/candidates?q=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <header className="bg-[#12141c] text-slate-200 sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center gap-6">
        <Link href="/inbox" className="flex items-center gap-2 shrink-0">
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-[11px] font-bold text-white">
            SA
          </span>
          <span className="text-[13px] font-semibold text-white tracking-tight hidden md:block">
            StaffAnchor
          </span>
        </Link>

        <nav className="flex items-center gap-0.5 text-[13px]">
          {navLinks.map((link) => {
            const active = link.enabled && pathname.startsWith(link.href);
            if (!link.enabled) {
              return (
                <span
                  key={link.label}
                  className="px-3 py-1.5 rounded-md text-slate-600 cursor-not-allowed select-none"
                  title="Coming soon"
                >
                  {link.label}
                </span>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  active
                    ? "text-white bg-white/[0.08]"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="hidden lg:flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.09] transition-colors rounded-lg px-3 py-1.5 w-64 border border-white/[0.06]">
          <Search className="w-3.5 h-3.5 text-slate-500" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Search candidates... (Enter)"
            className="bg-transparent text-[13px] text-slate-200 placeholder:text-slate-500 outline-none flex-1"
          />
          <kbd className="text-[10px] text-slate-500 bg-white/[0.06] rounded px-1 py-0.5">/</kbd>
        </div>

        <div className="relative">
          <button
            onClick={() => setCreateOpen((v) => !v)}
            onBlur={() => setTimeout(() => setCreateOpen(false), 150)}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 transition-colors text-white text-[13px] font-medium rounded-lg pl-2.5 pr-2 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {createOpen && (
            <div className="absolute right-0 mt-1.5 w-44 bg-white rounded-lg shadow-lg border border-slate-200 py-1 animate-fade-in">
              <Link href="/candidates/new" className="block px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
                New candidate
              </Link>
              <Link href="/mandates" className="block px-3 py-2 text-[13px] text-slate-700 hover:bg-slate-50">
                New mandate
              </Link>
            </div>
          )}
        </div>

        <button className="text-slate-400 hover:text-white transition-colors" title="Notifications">
          <Bell className="w-4 h-4" strokeWidth={2} />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            onBlur={() => setTimeout(() => setMenuOpen(false), 150)}
            className="flex items-center gap-2"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-[11px] font-semibold text-white">
              {initials}
            </div>
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-slate-200 py-1.5 animate-fade-in z-40">
              <div className="px-3 py-2 border-b border-slate-100">
                <p className="text-[13px] font-medium text-slate-900">{fullName ?? email}</p>
                <p className="text-[11px] text-slate-500 capitalize">{role}</p>
              </div>
              <div className="px-3 py-2">
                <SignOutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
