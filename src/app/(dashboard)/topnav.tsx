"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, ChevronDown } from "lucide-react";
import SignOutButton from "./sign-out-button";
import ThemeToggle from "@/components/theme-toggle";
import NotificationBell from "./notification-bell";
import CallsFlaggedBell from "./calls-flagged-bell";
import WhatsAppNavBadge from "./whatsapp-nav-badge";

type NavLink = { href: string; label: string; enabled: boolean };

// `also` lists pages that belong to a group but have no tab of their own, so the right heading still lights up.
const NAV_GROUPS: { id: string; label: string; items: string[]; also?: string[] }[] = [
  { id: "today", label: "Today", items: ["/today"], also: ["/tasks"] },
  // Everything about a role: the roles themselves, the clients behind them, new client business and the placements that follow.
  // Interviews and the old hiring board are no longer in the bar (no activity); their pages still open from links.
  { id: "roles", label: "Roles", items: ["/mandates", "/clients", "/client-acquisition", "/placements"], also: ["/interviews", "/hiring", "/employer-inquiries", "/sales", "/retention"] },
  { id: "people", label: "People", items: ["/candidates"], also: ["/saas-practice", "/referrals", "/whatsapp"] },
];

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
  adminLinks = [],
  fullName,
  email,
  role,
  initials,
}: {
  navLinks: NavLink[];
  /** Admin-only tools, kept out of the main bar and shown in the account menu. */
  adminLinks?: { href: string; label: string }[];
  fullName: string | null;
  email: string;
  role: string;
  initials: string;
}) {
  const pathname = usePathname();
  // Five places, not ten: related pages live together under one heading, and the pages inside show as a quiet row below.
  const present = new Map(navLinks.filter((l) => l.enabled).map((l) => [l.href, l]));
  const groups = NAV_GROUPS.map((g) => {
    const items = g.items.map((h) => present.get(h)).filter((x): x is NavLink => !!x);
    return { id: g.id, label: g.label, items, href: items[0]?.href ?? "/today", also: g.also ?? [] };
  }).filter((g) => g.items.length > 0);
  const activeGroup = groups.find((g) => [...g.items.map((i) => i.href), ...g.also].some((h) => pathname.startsWith(h))) ?? null;
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
    <header className="ros-glass border-b sticky top-0 z-30">
      <div className="max-w-[1500px] mx-auto px-3 sm:px-5 py-2 md:py-0 md:h-16 flex flex-wrap md:flex-nowrap items-center gap-x-3 gap-y-1.5 md:gap-4">
        <Link href="/today" className="flex items-center shrink-0">
          <Image
            src="/Staffanchor_Logo.svg"
            alt="StaffAnchor"
            width={150}
            height={52}
            priority
            className="h-8 md:h-9 w-auto object-contain"
          />
        </Link>

        <nav className="order-3 basis-full md:order-none md:basis-auto flex items-center gap-1 text-[13px] min-w-0 shrink overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
          {groups.map((g) => {
            const active = g.id === activeGroup?.id;
            return (
              <Link
                key={g.id}
                href={g.href}
                className={`px-3.5 md:px-4 py-1.5 md:py-2 rounded-full whitespace-nowrap shrink-0 font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  active
                    ? "bg-teal-600 text-white shadow-ros-sm"
                    : "text-slate-600 dark:text-slate-400 hover:bg-teal-50/80 dark:hover:bg-slate-800/80 hover:text-teal-700 dark:hover:text-white"
                }`}
              >
                {g.label}
                {g.id === "people" && !active ? <WhatsAppNavBadge /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 min-w-2 order-1 md:order-none" />

        <div className="order-2 md:order-none flex items-center gap-1.5 md:gap-2 shrink-0">
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
                className="ros-glass absolute right-0 mt-1.5 w-44 rounded-ros-lg shadow-ros-xl border py-1 animate-fade-in"
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

          <div className="hidden sm:block"><ThemeToggle /></div>

          <CallsFlaggedBell />

          <NotificationBell />

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="ros-focusable flex items-center gap-2"
              aria-label="Account menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-xs font-semibold text-white">
                {initials}
              </div>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="ros-glass absolute right-0 mt-2 w-56 rounded-ros-lg shadow-ros-xl border py-1.5 animate-fade-in z-40"
              >
                <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-[13px] font-medium text-slate-900 dark:text-slate-100">{fullName ?? email}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{role}</p>
                </div>
                {/* Lets a rep set their own outreach voice/bio (task: "per-user
                    AI outreach persona") instead of every Sales AI draft
                    claiming to be the founder regardless of who sends it. */}
                {adminLinks.length > 0 && (
                  <div className="border-b border-slate-100 py-1 dark:border-slate-800">
                    <p className="px-3 pb-1 pt-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Admin</p>
                    {adminLinks.map((a) => (
                      <Link
                        key={a.href}
                        href={a.href}
                        onClick={() => setMenuOpen(false)}
                        className="block px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/50"
                      >
                        {a.label}
                      </Link>
                    ))}
                  </div>
                )}
                <Link
                  href="/settings"
                  className="block px-3 py-2 text-[13px] text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800"
                  onClick={() => setMenuOpen(false)}
                >
                  Outreach persona settings
                </Link>
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[13px] text-slate-700 dark:border-slate-800 dark:text-slate-300 sm:hidden">
                  Dark mode <ThemeToggle />
                </div>
                <div className="px-3 py-2">
                  <SignOutButton />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {activeGroup && activeGroup.items.length > 1 && (
        <div className="max-w-[1500px] mx-auto px-3 sm:px-5 pb-2 md:-mt-1 flex items-center gap-1 text-[13px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {activeGroup.items.map((i) => {
            const on = pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`px-3 py-1 rounded-full whitespace-nowrap shrink-0 transition-colors ${on ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"}`}
              >
                {i.label}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}
