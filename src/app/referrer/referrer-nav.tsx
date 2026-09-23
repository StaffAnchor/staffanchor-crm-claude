"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LiveClock from "@/components/ui/live-clock";

function ReferrerSignOutButton() {
  const supabase = createClient();
  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }
  return (
    <button onClick={handleSignOut} className="text-[13px] text-slate-400 hover:text-white font-medium">
      Sign out
    </button>
  );
}

const NAV_LINKS = [
  { href: "/referrer/roles", label: "Roles" },
  { href: "/referrer/refer", label: "Refer someone" },
  { href: "/referrer/my-referrals", label: "My Referrals" },
  { href: "/referrer/payouts", label: "Payouts" },
];

export default function ReferrerNav({
  fullName,
  email,
  tier,
}: {
  fullName: string | null;
  email: string;
  tier: string;
}) {
  const pathname = usePathname();

  return (
    <header className="bg-[#12141c] text-slate-200 sticky top-0 z-30">
      <div className="max-w-[1100px] mx-auto px-5 h-14 flex items-center gap-6">
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="flex items-center justify-center rounded-lg bg-white/95 shadow-[0_1px_3px_rgba(0,0,0,0.35)] px-2 py-1">
            <Image
              src="/Staffanchor_Logo.svg"
              alt="StaffAnchor"
              width={134}
              height={46}
              priority
              className="h-9 w-auto object-contain"
            />
          </span>
          <span className="text-[13px] font-semibold text-teal-400 tracking-tight hidden md:block">
            Sales Circle
          </span>
        </div>

        <nav className="flex items-center gap-1 text-[13px]">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-4 py-1.5 rounded-full whitespace-nowrap font-medium tracking-tight transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                  active ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
                {active && (
                  <span className="pointer-events-none absolute left-1/2 -bottom-[9px] h-[2px] w-5 -translate-x-1/2 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.7)]" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {tier === "trusted" && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/20">
            Trusted
          </span>
        )}
        <LiveClock />
        <span className="text-[12px] text-slate-400 hidden sm:block">{fullName ?? email}</span>
        <ReferrerSignOutButton />
      </div>
    </header>
  );
}
