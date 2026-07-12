"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LiveClock from "@/components/ui/live-clock";

function VendorSignOutButton() {
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
  { href: "/vendor/mandates", label: "My Mandates" },
  { href: "/vendor/submissions", label: "My Submissions" },
  { href: "/vendor/inbox", label: "Priority Actions" },
];

export default function VendorNav({
  fullName,
  email,
}: {
  fullName: string | null;
  email: string;
}) {
  const pathname = usePathname();

  return (
    <header className="bg-[#12141c] text-slate-200 sticky top-0 z-30">
      <div className="max-w-[1100px] mx-auto px-5 h-14 flex items-center gap-6">
        <div className="flex items-center gap-2.5 shrink-0">
          <Image
            src="/Staffanchor_Logo.svg"
            alt="StaffAnchor"
            width={104}
            height={36}
            priority
            className="h-8 w-auto rounded-md bg-white/95 px-1.5 py-0.5"
          />
          <span className="text-[13px] font-semibold text-teal-400 tracking-tight hidden md:block">
            Vendor Portal
          </span>
        </div>

        <nav className="flex items-center gap-0.5 text-[13px]">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  active ? "text-white bg-white/[0.08]" : "text-slate-400 hover:text-white hover:bg-white/[0.05]"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        <LiveClock />

        <span className="text-[12px] text-slate-400 hidden sm:block">{fullName ?? email}</span>
        <VendorSignOutButton />
      </div>
    </header>
  );
}
