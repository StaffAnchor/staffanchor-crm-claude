import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  const initials = (profile?.full_name ?? profile?.email ?? "?")
    .split(" ")
    .map((p: string) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const navLinks = [
    { href: "/candidates", label: "Candidates" },
    { href: "/mandates", label: "Mandates" },
  ];
  if (profile?.role === "admin") {
    navLinks.push({ href: "/team", label: "Team" });
  }

  return (
    <div className="min-h-screen bg-[#f4f5f9]">
      <header className="bg-[#1a1d29] text-slate-200">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <span className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-blue-500 flex items-center justify-center text-xs font-bold text-white">
                SA
              </span>
              StaffAnchor CRM
            </span>
            <nav className="flex items-center gap-1 text-sm">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right leading-tight hidden sm:block">
              <p className="text-slate-200 font-medium">{profile?.full_name ?? profile?.email}</p>
              <p className="text-slate-400 text-xs capitalize">{profile?.role}</p>
            </div>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-semibold text-white">
              {initials}
            </div>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
