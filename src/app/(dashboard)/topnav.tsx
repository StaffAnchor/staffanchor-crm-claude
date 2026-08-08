"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import SignOutButton from "./sign-out-button";
import ThemeToggle from "@/components/theme-toggle";
import NotificationBell from "./notification-bell";

type NavLink = { href: string; label: string; enabled: boolean };

// Redesigned per direct feedback (Aug 2026): the old header was dark navy
// with a search box, a live clock, and a date -- all of which ate up
// horizontal room that should've gone to nav tabs, and none of which
// earned their keep (the search box only ever did one thing -- jump to
// /candidates?q= on Enter -- which the Candidates page's own search does
// just as well; the clock/date were pure decoration). Both are gone.
// Light, white-background chrome with teal as the single accent color
// (active tab, create button) replaces the previous all-dark treatment,
// still with a full dark-mode variant since ThemeToggle stays.
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    <header className="bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
      <div className="max-w-[1500px] mx-auto px-5 h-14 flex items-center gap-4">
        <Link href="/inbox" className="flex items-center shrink-0">
          <Image
            src="/Staffanchor_Logo.svg"
            alt="StaffAnchor"
            width={150}
            height={52}
            priority
            className="h-9 w-auto object-contain"
          />
        </Link>

        <nav className="flex items-center gap-1 text-[13px] min-w-0 shrink overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navLinks.map((link) => {
            const active = link.enabled && pathname.startsWith(link.href);
            if (!link.enabled) {
              return (
                <span
                  key={link.label}
                  className="px-3.5 py-1.5 rounded-full whitespace-nowrap text-slate-300 dark:text-slate-600 cursor-not-allowed select-none"
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
                className={`px-3.5 py-1.5 rounded-full whitespace-nowrap font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  active
                    ? "bg-teal-600 text-white shadow-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-teal-50 dark:hover:bg-slate-800 hover:text-teal-700 dark:hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-2" />

        <div className="flex items-center gap-2 shrink-0">
          <div className="relative" ref={createRef}>
            <button
              onClick={() => setCreateOpen((v) => !v)}
              className="ros-focusable flex items-center gap-1 bg-teal-600 hover:bg-teal-500 transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] text-white text-[13px] font-medium rounded-lg pl-2.5 pr-2 py-1.5"
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
                className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1 animate-fade-in"
              >
                <Link
                  href="/candidates/new"
                  onClick={() => setCreateOpen(false)}
                  className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  New candidate
                </Link>
                <Link
                  href="/mandates#new-mandate"
                  onClick={() => setCreateOpen(false)}
                  className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  New mandate
                </Link>
              </div>
            )}
          </div>

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
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-[11px] font-semibold text-white">
                {initials}
              </div>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-900 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 py-1.5 animate-fade-in z-40"
              >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{fullName ?? email}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">{role}</p>
                </div>
                {/* Lets a rep set their own outreach voice/bio (task: "per-user
                    AI outreach persona") instead of every Sales AI draft
                    claiming to be the founder regardless of who sends it. */}
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800"
                  onClick={() => setMenuOpen(false)}
                >
                  Outreach persona settings
                </Link>
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
