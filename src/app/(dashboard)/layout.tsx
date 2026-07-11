import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopNav from "./topnav";

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
    { href: "/inbox", label: "🔥 Priority Actions", enabled: true },
    { href: "/candidates", label: "Candidates", enabled: true },
    { href: "/mandates", label: "Mandates", enabled: true },
    { href: "/clients", label: "Clients", enabled: true },
    { href: "/interviews", label: "Interviews", enabled: true },
    { href: "/reports", label: "Reports", enabled: true },
    { href: "/referrals", label: "Referrals", enabled: true },
    ...(profile?.role === "admin" ? [{ href: "/team", label: "Team", enabled: true }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <TopNav
        navLinks={navLinks}
        fullName={profile?.full_name ?? null}
        email={profile?.email ?? user.email ?? ""}
        role={profile?.role ?? "recruiter"}
        initials={initials}
      />
      {children}
    </div>
  );
}
