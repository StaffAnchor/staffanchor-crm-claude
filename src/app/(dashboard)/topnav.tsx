"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, Plus, ChevronDown } from "lucide-react";
import SignOutButton from "./sign-out-button";
import ThemeToggle from "@/components/theme-toggle";
import NotificationBell from "./notification-bell";
import LiveClock from "@/components/ui/live-clock";

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
  const createRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && search.trim()) {
      router.push(`/candidates?q=${encodeURIComponent(search.trim())}`);
    }
  }

  // Click-outside-to-close instead of onBlur+setTimeout: the old blur-based
  // close raced against the Link's own click/navigation (a mousedown that
  // shifts focus fires blur *before* the click event completes), so a
  // dropdown item could silently fail to navigate on some devices/browsers
  // -- this is what was blocking "New candidate"/"New mandate" for at least
  // one recruiter even though nothing in the app is actually role-gated.
  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (createRef.current && !createRef.current.contains(e.target as Node)) setCreateOpen(false);
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <header className="bg-[#12141c] text-slate-200 sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center gap-6">
        <Link href="/inbox" className="flex items-center shrink-0">
          <span className="flex items-center justify-center rounded-lg bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.35)] px-2 py-1">
            <Image
              src="/Staffanchor_Logo.svg"
              alt="StaffAnchor"
              width={150}
              height={52}
              priority
              className="h-11 w-auto object-contain"
            />
          </span>
        </Link>

        <nav className="flex items-center gap-1 text-[13px] min-w-0 shrink overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navLinks.map((link) => {
            const active = link.enabled && pathname.startsWith(link.href);
            if (!link.enabled) {
              return (
                <span
                  key={link.label}
                  className="px-4 py-1.5 rounded-full whitespace-nowrap text-slate-600 dark:text-slate-400 cursor-not-allowed select-none"
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
                className={`relative px-4 py-1.5 rounded-full whitespace-nowrap font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  active
                    ? "text-white bg-white/[0.08]"
                    : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
                {active && (
                  <span className="pointer-events-none absolute left-1/2 -bottom-[9px] h-[2px] w-5 -translate-x-1/2 rounded-full bg-blue-500 shadow-[0_0_6px_rgba(59,130,246,0.7)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-2" />

        <div className="hidden lg:flex items-center gap-2 bg-slate-900/50 hover:border-slate-700 focus-within:border-blue-500/50 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] rounded-lg px-3 py-1.5 w-64 min-w-[8rem] shrink border border-slate-800">
          <Search className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Search candidates... (Enter)"
            aria-label="Search candidates"
            className="bg-transparent text-[13px] text-slate-200 placeholder:text-slate-500 outline-none flex-1"
          />
          <kbd className="text-[10px] text-slate-500 dark:text-slate-400 bg-white/[0.06] rounded px-1.5 py-0.5 flex items-center justify-center">/</kbd>
        </div>

        <div className="flex items-center gap-3 shrink-0">
        <div className="relative" ref={createRef}>
          <button
            onClick={() => setCreateOpen((v) => !v)}
            className="ros-focusable flex items-center gap-1 bg-blue-600 hover:bg-blue-500 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] text-white text-[13px] font-medium rounded-lg pl-2.5 pr-2 py-1.5"
            aria-label="Create new"
            aria-haspopup="menu"
            aria-expanded={createOpen}
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
            <ChevronDown className="w-3 h-3 opacity-70" />
          </button>
          {createOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-900 dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 animate-fade-in"
            >
              <Link
                href="/candidates/new"
                onClick={() => setCreateOpen(false)}
                className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-700"
              >
                New candidate
              </Link>
              <Link
                href="/mandates"
                onClick={() => setCreateOpen(false)}
                className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50 dark:hover:bg-slate-700"
              >
                New mandate
              </Link>
            </div>
          )}
        </div>

        <LiveClock />

        <ThemeToggle />

        <NotificationBell />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="ros-focusable flex items-center gap-2"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-[11px] font-semibold text-white">
              {initials}
            </div>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 animate-fade-in z-40"
            >
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 dark:border-slate-700">
                <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100 dark:text-slate-100">{fullName ?? email}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{role}</p>
              </div>
              <div className="px-3 py-2">
                <SignOutButton />
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
    </header>
  );
}
